// Import the dotenv package to load environment variables from a .env file
require('dotenv').config();

// --- Node.js built-in and third-party modules ---
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

// --- Google Cloud Client Libraries ---
const { VideoIntelligenceServiceClient } = require('@google-cloud/video-intelligence');
const { Storage } = require('@google-cloud/storage');

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
    }
});
const storage = new Storage({
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
    }
}
);

// --- Environment Variable Validation ---
const bucketName = process.env.GCS_BUCKET_NAME;
if (!bucketName || bucketName === 'your-gcs-bucket-name') {
  console.error('ERROR: GCS_BUCKET_NAME is not set. Please update the .env file.');
  process.exit(1);
}
const bucket = storage.bucket(bucketName);
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
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB file size limit
  },
});

// The core face detection function remains the same
async function analyzeVideoFaces(gcsUri) {
//   console.log(`Analyzing video at: ${gcsUri}`);

  const request = {
    inputUri: gcsUri,
    features: ['FACE_DETECTION'],
    videoContext: {
      faceDetectionConfig: {
        // Set to true to include bounding-box info
        includeBoundingBoxes: true,
        // Set to true to include attributes like glasses, smiling, etc.
        includeAttributes: true,
      },
    },
  };

  try {
    // Detects faces in a video
    const [operation] = await videoIntelligenceClient.annotateVideo(request);
    console.log('Waiting for operation to complete...');

    const [operationResult] = await operation.promise();
    console.log('Face detection complete.');

    // Gets annotations for video
    const faceAnnotations = operationResult.annotationResults[0].faceDetectionAnnotations;

    if (!faceAnnotations || faceAnnotations.length === 0) {
      console.log('No faces found in the video.');
      return;
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
        return {
            src: `data:image/jpeg;base64,${faceAnnotation.thumbnail.toString('base64')}`
        }
    })
    
    

    return {faceAnnotations, thumbnails}
  } catch (err) {
    console.error('ERROR:', err);
  }
}

// --- API Endpoint Definition ---
app.post('/upload', upload.single('video'), (req, res) => {
  if (!req.file) {
    return res.status(400).send({ message: 'No file uploaded. Please use the "video" field.' });
  }

  console.log('req', req.file.filename);
  

  // Create a unique filename for the GCS blob
  const blob = bucket.file(Date.now() + path.extname(req.file.originalname));
  const blobStream = blob.createWriteStream({
    resumable: false,
  });

  blobStream.on('error', err => {
    console.error('GCS Upload Error:', err);
    res.status(500).send({ message: 'Could not upload the file to GCS.', error: err.message });
  });

  blobStream.on('finish', async () => {
    const gcsUri = `gs://${bucket.name}/${blob.name}`;
    console.log(`File successfully uploaded to GCS: ${gcsUri}`);

    // Respond to the client immediately with "Accepted" status
    

    // Asynchronously start the long-running video analysis
    const {faceAnnotations, thumbnails} = await analyzeVideoFaces(gcsUri);
    
    
    res.status(200).send({
      message: `Upload successful. Analysis has been initiated for ${blob.name}. Results will be logged to the server console.`,
      gcsUri: gcsUri,
      thumbnail: faceAnnotations[0],
      image: `data:image/jpeg;base64,${faceAnnotations[0].thumbnail.toString('base64')}`,
      thumbnails
    });
    

    // res.status(200).send({
    //   message: `Upload successful. Analysis has been initiated for ${blob.name}. Results will be logged to the server console.`,
    //   gcsUri: gcsUri,
    //   faceAnnotations:faceAnnotations
    // });
  });

  // Pipe the uploaded file's buffer to the GCS write stream
  blobStream.end(req.file.buffer);
});

// --- Start the Express Server ---
app.listen(PORT, () => {
//   console.log(`Server listening on port ${PORT}`);
//   console.log(`To upload a video, send a POST request with a 'video' file to http://localhost:${PORT}/upload`);
});