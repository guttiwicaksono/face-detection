// Import the dotenv package to load environment variables from a .env file
require('dotenv').config();

// --- Node.js built-in and third-party modules ---
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const jimp = require('jimp');

// --- Google Cloud Client Libraries ---
const { VideoIntelligenceServiceClient } = require('@google-cloud/video-intelligence');
const { ImageAnnotatorClient } = require('@google-cloud/vision');

// --- Instantiate Google Cloud Clients ---
const videoIntelligenceClient = new VideoIntelligenceServiceClient({
    projectId:process.env.GCS_PROJECT_ID,
    credentials: {
        "type": process.env.GCS_TYPE,
        "project_id": process.env.GCS_PROJECT_ID,
        "private_key_id": process.env.GCS_PRIVATE_KEY_ID,
        "private_key": process.env.GCS_PRIVATE_KEY,
        "client_email": process.env.GCS_CLIENT_EMAIL,
        "client_id": process.env.GCS_CLIENT_ID,
        "auth_uri": process.env.GCS_AUTH_URI,
        "token_uri": process.env.GCS_TOKEN_URI,
        "auth_provider_x509_cert_url": process.env.GCS_AUTH_PROVIDER_X509_CERT_URL,
        "client_x509_cert_url": process.env.GCS_CLIENT_X509_CERT_URL,
    },
});

const imageAnnotatorClient = new ImageAnnotatorClient({
    projectId:process.env.GCS_PROJECT_ID,
    credentials: {
        "type": process.env.GCS_TYPE,
        "project_id": process.env.GCS_PROJECT_ID,
        "private_key_id": process.env.GCS_PRIVATE_KEY_ID,
        "private_key": process.env.GCS_PRIVATE_KEY,
        "client_email": process.env.GCS_CLIENT_EMAIL,
        "client_id": process.env.GCS_CLIENT_ID,
        "auth_uri": process.env.GCS_AUTH_URI,
        "token_uri": process.env.GCS_TOKEN_URI,
        "auth_provider_x509_cert_url": process.env.GCS_AUTH_PROVIDER_X509_CERT_URL,
        "client_x509_cert_url": process.env.GCS_CLIENT_X509_CERT_URL,
    },
});

const PORT = process.env.PORT || 3000;

// --- Express App and Middleware Setup ---
const app = express();

// Enable CORS for all routes. This allows your frontend application
// to make requests to this backend server from a different origin.
app.use(cors());

// Serve static files (HTML, CSS, client-side JS) from the 'public' directory
app.use(express.static('public'));

// Configure multer for in-memory file storage to handle uploads
const upload = multer({
  storage: multer.memoryStorage(),
  // limits: {
  //   fileSize: 100 * 1024 * 1024, // 100 MB file size limit
  // },
});

/**
 * Analyzes faces in a static image using the Google Vision API.
 * @param {Buffer} imageBuffer The buffer of the image file.
 * @param {string} mimeType The MIME type of the image.
 * @returns {Promise<object>} An object containing annotations and generated thumbnails.
 */
async function analyzeImageFaces(imageBuffer, mimeType) {
  console.log(`Analyzing image from buffer with MIME type: ${mimeType}...`);
  const [result] = await imageAnnotatorClient.faceDetection({
    image: { content: imageBuffer },
  });
  const faceAnnotations = result.faceAnnotations;

  if (!faceAnnotations || faceAnnotations.length === 0) {
    console.log('No faces found in the image.');
    return { faceAnnotations: [], thumbnails: [], objectAnnotations: [] };
  }

  console.log(`Found ${faceAnnotations.length} face(s) in the image.`);

  // Reading from a buffer is more direct and avoids ENAMETOOLONG errors
  // that can happen if a data URI string is too long.
  const image = await jimp.read(imageBuffer);
  const thumbnails = [];

  for (const face of faceAnnotations) {
    // The Vision API provides a bounding polygon for the face.
    const vertices = face.boundingPoly.vertices;
    const x = vertices[0].x;
    const y = vertices[0].y;
    const width = vertices[2].x - x;
    const height = vertices[2].y - y;

    // Create a thumbnail by cropping the face from the original image.
    const faceThumbnail = image.clone().crop(x, y, width, height);
    const thumbnailBuffer = await faceThumbnail.getBufferAsync(jimp.MIME_JPEG);
    thumbnails.push({
      src: `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`,
      buffer: thumbnailBuffer // Keep the buffer for server-side processing
    });
  }

  // The Vision API's faceDetection doesn't include object tracking, so we return an empty array.
  return { faceAnnotations, thumbnails, objectAnnotations: [] };
}

/**
 * Calculates the Hamming distance between two pHash strings.
 * This is a fallback for older jimp versions that might not have `pHashDistance`.
 * @param {string} hash1 - The first perceptual hash.
 * @param {string} hash2 - The second perceptual hash.
 * @returns {number} The normalized Hamming distance (0 to 1).
 */
function calculatePHashDistance(hash1, hash2) {
  // The `pHashDistance` function might not exist in all versions of jimp.
  // This provides a manual fallback.
  if (typeof jimp.pHashDistance === 'function') {
    return jimp.pHashDistance(hash1, hash2);
  }

  // Manual fallback implementation for Hamming distance
  let distance = 0;
  const bits = 64; // pHash is a 64-bit hash

  // Convert hex hashes to binary strings, padding with zeros to ensure they are 64 bits long
  const binary1 = BigInt('0x' + hash1).toString(2).padStart(bits, '0');
  const binary2 = BigInt('0x' + hash2).toString(2).padStart(bits, '0');

  for (let i = 0; i < bits; i++) {
    if (binary1[i] !== binary2[i]) {
      distance++;
    }
  }

  return distance / bits;
}

/**
 * Groups similar face thumbnails using perceptual hashing.
 * @param {Array<object>} thumbnails - An array of thumbnail objects, each with a 'src' property (base64 string).
 * @returns {Promise<Array<Array<object>>>} A promise that resolves to an array of groups, where each group is an array of similar thumbnail objects.
 */
async function groupSimilarFaces(thumbnails) {
  // If there's only one or no face, no need to group. Return it as a single group.
  if (!thumbnails || thumbnails.length < 2) {
    return thumbnails.length > 0 ? [thumbnails] : [];
  }

  console.log(`Grouping ${thumbnails.length} detected faces...`);

  const faceData = [];
  // Calculate pHash for each thumbnail
  for (const thumb of thumbnails) {
    // Use the buffer directly to avoid ENAMETOOLONG errors from long data URIs
    // and to prevent re-introducing MIME detection errors.
    if (!thumb.buffer || thumb.buffer.length === 0) {
      console.warn('Skipping an empty or invalid thumbnail buffer.');
      continue;
    }
    const image = await jimp.read(thumb.buffer);
    const hash = image.pHash();
    faceData.push({
      src: thumb.src,
      hash: hash,
    });
  }

  const numFaces = faceData.length;
  if (numFaces < 2) {
    return faceData.length > 0 ? [faceData.map(f => ({ src: f.src }))] : [];
  }

  // A threshold for perceptual hash distance. A lower value is stricter.
  // This value may require tuning for best results. A value of 0.125
  // means that up to 8 bits (out of 64) can be different for two
  // images to be considered similar. This should provide a good balance
  // between grouping similar faces and separating different ones.
  const pHashThreshold = 0.03125;

  // Build adjacency list for the graph of faces
  const adj = Array(numFaces).fill(0).map(() => []);
  for (let i = 0; i < numFaces; i++) {
    for (let j = i + 1; j < numFaces; j++) {
      const distance = calculatePHashDistance(faceData[i].hash, faceData[j].hash);
      if (distance <= pHashThreshold) {
        adj[i].push(j);
        adj[j].push(i);
      }
    }
  }

  // Find connected components (groups of similar faces) using DFS
  const visited = Array(numFaces).fill(false);
  const groups = [];

  function dfs(u, currentGroup) {
    visited[u] = true;
    currentGroup.push(faceData[u]);
    for (const v of adj[u]) {
      if (!visited[v]) {
        dfs(v, currentGroup);
      }
    }
  }

  for (let i = 0; i < numFaces; i++) {
    if (!visited[i]) {
      const currentGroup = [];
      dfs(i, currentGroup);
      groups.push(currentGroup);
    }
  }

  console.log(`Found ${groups.length} unique face groups.`);
  // Return an array of groups, where each group is an array of thumbnail objects with only the 'src' property.
  return groups.map(group => group.map(face => ({ src: face.src })));
}

// The core face detection function remains the same
async function analyzeVideoFaces(videoBuffer, startTime, endTime) {
  console.log(`Analyzing video from buffer...`);
  if (startTime != null && endTime != null) {
    console.log(`Analyzing video segment from ${startTime}s to ${endTime}s.`);
  }

  const request = {
    inputContent: videoBuffer,
    features: ['FACE_DETECTION','OBJECT_TRACKING'],
    videoContext: {
      faceDetectionConfig: {
        // Set to true to include bounding-box info
        includeBoundingBoxes: true,
        // Set to true to include attributes like glasses, smiling, etc.
        includeAttributes: false,
      },
    },
  };

  // If start and end times are provided, add a segment to the request
  if (startTime != null && endTime != null) {
    request.videoContext.segments = [{
      startTimeOffset: {
        seconds: Math.floor(startTime),
        nanos: Math.round((startTime % 1) * 1e9)
      },
      endTimeOffset: {
        seconds: Math.floor(endTime),
        nanos: Math.round((endTime % 1) * 1e9)
      }
    }];
  }

  try {
    // Detects faces in a video
    const [operation] = await videoIntelligenceClient.annotateVideo(request);
    console.log('Waiting for operation to complete...');

    const [operationResult] = await operation.promise();
    console.log('Face detection complete.');

    // Gets annotations for video
    const faceAnnotations = operationResult.annotationResults[0].faceDetectionAnnotations;
    const objectAnnotations = operationResult.annotationResults[0].objectAnnotations;

    if (!faceAnnotations || faceAnnotations.length === 0) {
      console.log('No faces found in the video.');
      return { faceAnnotations: [], thumbnails: [] };
    }

    console.log('Found faces:');
    faceAnnotations.forEach((faceAnnotation, i) => {
      console.log(`\n--- Face #${i + 1} ---`);
      
    //   faceAnnotation.segments.forEach(segment => {
    //     const { startTimeOffset, endTimeOffset } = segment.segment;
    //     console.log(
    //       `  - Start: ${startTimeOffset.seconds || 0}.${(startTimeOffset.nanos || 0) / 1e6}s`
    //     );
    //     console.log(
    //       `  - End: ${endTimeOffset.seconds || 0}.${(endTimeOffset.nanos || 0) / 1e6}s`
    //     );
    //   });

    //   // Each face is tracked over time, and a thumbnail is generated for each track.
    //   faceAnnotation.thumbnails.forEach((thumbnail, j) => {
    //     // Thumbnails are returned as a base64-encoded string
    //     console.log(`  - Thumbnail #${j + 1}: A ${thumbnail.data.length}-byte thumbnail is available.`);
    //     // You could save this to a file, e.g., fs.writeFileSync(`thumbnail_${i}_${j}.jpg`, thumbnail.data, 'base64');
    //   });

      // Tracks are used to track the same face over time.
      console.log('Tracks:');
    //   faceAnnotation.tracks.forEach((track, k) => {
    //     console.log(`  - Track #${k + 1}:`);
    //     const trackStart = track.segment.startTimeOffset;
    //     const trackEnd = track.segment.endTimeOffset;
    //     console.log(
    //       `    - Appears from: ${trackStart.seconds || 0}.${(trackStart.nanos || 0) / 1e6}s`
    //     );
    //     console.log(
    //       `    - Disappears at: ${trackEnd.seconds || 0}.${(trackEnd.nanos || 0) / 1e6}s`
    //     );

    //     // Each track has a series of timestamps with bounding box information.
    //     track.timestampedObjects.forEach((timestampedObject, l) => {
    //         const box = timestampedObject.normalizedBoundingBox;
    //         const time = timestampedObject.timeOffset;
    //         console.log(`    - Timestamp #${l + 1}: ${time.seconds || 0}.${(time.nanos || 0) / 1e6}s`);
    //         console.log(`      - Bounding box: Left: ${box.left.toFixed(3)}, Top: ${box.top.toFixed(3)}, Right: ${box.right.toFixed(3)}, Bottom: ${box.bottom.toFixed(3)}`);

    //         // You can also access attributes if includeAttributes was true
    //         if (timestampedObject.attributes && timestampedObject.attributes.length > 0) {
    //             console.log(`      - Attributes:`);
    //             timestampedObject.attributes.forEach(attr => {
    //                 console.log(`        - ${attr.name}: ${attr.value} (Confidence: ${attr.confidence.toFixed(3)})`);
    //             });
    //         }
    //     });
    //   });
    });


    const thumbnails = faceAnnotations.map(faceAnnotation => {
        const buffer = faceAnnotation.thumbnail;
        return {
            src: `data:image/jpeg;base64,${buffer.toString('base64')}`,
            buffer: buffer // Keep the buffer for server-side processing
        }
    })
    
    return {faceAnnotations, thumbnails, objectAnnotations}
  } catch (err) {
    console.error('ERROR:', err);
  }
}

// --- API Endpoint Definition ---
app.post('/upload', upload.single('video'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded. Please use the "video" field.' });
  }

  try {
    console.log(`Received file: ${req.file.originalname}, MIME type: ${req.file.mimetype}`);

    let analysisResult;
    const isVideo = req.file.mimetype.startsWith('video/');
    const isImage = req.file.mimetype.startsWith('image/');

    if (isVideo) {
      // Get start and end times from the request body
      const startTime = req.body.startTime ? parseFloat(req.body.startTime) : null;
      const endTime = req.body.endTime ? parseFloat(req.body.endTime) : null;

      // Asynchronously start the long-running video analysis from the buffer
      analysisResult = await analyzeVideoFaces(req.file.buffer, startTime, endTime);
    } else if (isImage) {
      // Analyze the image
      analysisResult = await analyzeImageFaces(req.file.buffer, req.file.mimetype);
    } else {
      return res.status(400).json({ message: `Unsupported file type: ${req.file.mimetype}. Please upload a video or an image.` });
    }

    if (!analysisResult || !analysisResult.thumbnails || analysisResult.thumbnails.length === 0) {
      return res.status(200).json({
        message: `Analysis complete. No faces were detected in the ${isImage ? 'image' : 'video'}.`,
        faceGroups: []
      });
    }

    // Group similar faces to identify unique individuals
    const faceGroups = await groupSimilarFaces(analysisResult.thumbnails);

    // Prepare thumbnails for the client, sending only the data URI source.
    const clientThumbnails = analysisResult.thumbnails.map(({ src }) => ({ src }));

    res.status(200).json({
      message: `Successfully analyzed ${isImage ? 'image' : 'video'} and found ${faceGroups.length} unique face(s) from ${analysisResult.thumbnails.length} total detections. Powered by CESA AI`,
      faceGroups: faceGroups,
      ungroupedFaces: clientThumbnails,
      // Conditionally add objectAnnotations if they exist (they will for video)
      ...(analysisResult.objectAnnotations && { objectAnnotations: analysisResult.objectAnnotations }),
    });
  } catch (error) {
    console.error('Analysis Error:', error);
    res.status(500).json({ message: 'An error occurred during analysis.', error: error.message });
  }
});

// --- Start the Express Server ---
app.listen(PORT, () => {
//   console.log(`Server listening on port ${PORT}`);
//   console.log(`To upload a video, send a POST request with a 'video' file to http://localhost:${PORT}/upload`);
});