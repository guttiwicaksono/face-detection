class FaceDetectionApp {
    constructor() {
        this.selectedFile = null;
        this.videoDuration = 0;
        this.videoUrl = null; // To hold the object URL
        this.isUpdatingThumbnails = false; // Flag to prevent concurrent thumbnail updates
        this.currentZoom = 1;
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        // Main elements
        this.uploadArea = document.getElementById('uploadArea');
        this.videoInput = document.getElementById('videoInput');
        this.selectedFileDiv = document.getElementById('selectedFile');
        this.fileName = document.getElementById('fileName');
        this.fileSize = document.getElementById('fileSize');
        this.removeFileBtn = document.getElementById('removeFile');
        this.processBtn = document.getElementById('processBtn');
        this.resultsSection = document.getElementById('resultsSection');
        this.errorSection = document.getElementById('errorSection');
        this.resultImage = document.getElementById('resultImage');
        this.resultImageContainer = document.getElementById('resultImageContainer');
        this.resultMessage = document.getElementById('resultMessage');
        this.downloadBtn = document.getElementById('downloadBtn');
        this.errorMessage = document.getElementById('errorMessage');
        this.retryBtn = document.getElementById('retryBtn');

        // Trimmer elements
        this.trimmerSection = document.getElementById('trimmerSection');
        this.videoPreview = document.getElementById('videoPreview');
        this.trimmerSlider = document.getElementById('trimmerSlider');
        this.startTime = document.getElementById('startTime');
        this.endTime = document.getElementById('endTime');
        this.thumbnailPreview = document.getElementById('thumbnailPreview');
        this.thumbnailCanvas = document.getElementById('thumbnailCanvas');
        this.thumbnailCtx = this.thumbnailCanvas ? this.thumbnailCanvas.getContext('2d') : null;

        // New elements for start/end thumbnails and zoom modal
        this.startThumbnailCanvas = document.getElementById('startThumbnailCanvas');
        this.endThumbnailCanvas = document.getElementById('endThumbnailCanvas');
        this.startThumbnailCtx = this.startThumbnailCanvas ? this.startThumbnailCanvas.getContext('2d') : null;
        this.endThumbnailCtx = this.endThumbnailCanvas ? this.endThumbnailCanvas.getContext('2d') : null;
        this.zoomModal = document.getElementById('zoomModal');
        this.zoomedImage = document.getElementById('zoomedImage');
        this.closeModalBtn = document.querySelector('.close-modal');
    }

    bindEvents() {
        // Upload area events
        this.uploadArea.addEventListener('click', () => this.videoInput.click());
        this.uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
        this.uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
        this.uploadArea.addEventListener('drop', this.handleDrop.bind(this));

        // File input change
        this.videoInput.addEventListener('change', this.handleFileSelect.bind(this));

        // Remove file button
        this.removeFileBtn.addEventListener('click', this.removeFile.bind(this));

        // Process button
        this.processBtn.addEventListener('click', this.processFile.bind(this));

        // Download button
        this.downloadBtn.addEventListener('click', this.downloadImage.bind(this));

        // Retry button
        this.retryBtn.addEventListener('click', this.retry.bind(this));

        // Video preview events
        this.videoPreview.addEventListener('loadedmetadata', this.handleVideoMetadata.bind(this));

        // New modal and thumbnail events
        this.closeModalBtn.addEventListener('click', this.closeZoomModal.bind(this));
        this.zoomModal.addEventListener('click', (e) => {
            if (e.target === this.zoomModal) { // Close if clicking on backdrop
                this.closeZoomModal();
            }
        });
        this.startThumbnailCanvas.addEventListener('click', () => {
            if (this.trimmerSlider.noUiSlider) {
                const [startTime] = this.trimmerSlider.noUiSlider.get();
                this.openZoomModal(parseFloat(startTime));
            }
        });
        this.endThumbnailCanvas.addEventListener('click', () => {
            if (this.trimmerSlider.noUiSlider) {
                const [, endTime] = this.trimmerSlider.noUiSlider.get();
                this.openZoomModal(parseFloat(endTime));
            }
        });
        this.zoomedImage.addEventListener('wheel', this.handleZoom.bind(this), { passive: false });

    }

    handleDragOver(e) {
        e.preventDefault();
        this.uploadArea.classList.add('dragover');
    }

    handleDragLeave(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');
    }

    handleDrop(e) {
        e.preventDefault();
        this.uploadArea.classList.remove('dragover');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.handleFile(files[0]);
        }
    }

    handleFileSelect(e) {
        const file = e.target.files[0];
        if (file) {
            this.handleFile(file);
        }
    }

    handleFile(file) {
        // Validate file type
        const allowedVideoTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/mkv', 'video/wmv', 'video/x-flv', 'video/webm', 'video/quicktime'];
        // Common image types supported by Google Vision API
        const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/bmp', 'image/webp', 'image/tiff'];

        const allAllowedTypes = [...allowedVideoTypes, ...allowedImageTypes];

        if (!allAllowedTypes.includes(file.type)) {
            // A more generic error message
            this.showError('Unsupported file type. Please upload a valid video (e.g., MP4, MOV) or image (e.g., JPEG, PNG).');
            return;
        }

        // Validate file size (100MB limit)
        const maxSize = 100 * 1024 * 1024; // 100MB
        if (file.size > maxSize) {
            this.showError('File size must be less than 100MB');
            return;
        }

        this.selectedFile = file;
        this.displaySelectedFile(file);
        this.hideError();
        this.hideResults();

        if (file.type.startsWith('video/')) {
            this.setupTrimmer(file);
        } else {
            this.trimmerSection.style.display = 'none';
            if (this.trimmerSlider.noUiSlider) this.trimmerSlider.noUiSlider.destroy();
        }
    }

    displaySelectedFile(file) {
        this.fileName.textContent = file.name;
        this.fileSize.textContent = this.formatFileSize(file.size);
        this.selectedFileDiv.style.display = 'block';
        this.uploadArea.style.display = 'none';
        this.processBtn.disabled = false;
    }

    removeFile() {
        this.selectedFile = null;
        this.selectedFileDiv.style.display = 'none';
        this.uploadArea.style.display = 'block';
        this.processBtn.disabled = true;
        this.videoInput.value = '';
        this.hideResults();
        this.hideError();

        // Trimmer cleanup
        this.trimmerSection.style.display = 'none';
        if (this.trimmerSlider.noUiSlider) {
            this.trimmerSlider.noUiSlider.destroy();
        }
        if (this.videoUrl) {
            URL.revokeObjectURL(this.videoUrl);
            this.videoUrl = null;
        }
        this.videoPreview.src = '';
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatTime(totalSeconds) {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = Math.floor(totalSeconds % 60);
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    async processFile() {
        if (!this.selectedFile) return;

        this.setProcessingState(true);
        this.hideError();
        this.hideResults();

        try {
            const formData = new FormData();

            // Add trim times if it's a video and slider exists
            if (this.selectedFile.type.startsWith('video/') && this.trimmerSlider.noUiSlider) {
                const [startTime, endTime] = this.trimmerSlider.noUiSlider.get();
                formData.append('startTime', startTime);
                formData.append('endTime', endTime);
            }
            formData.append('video', this.selectedFile);

            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            console.log('result', result);
            console.log('response', response);
            
            

            this.showResults(result.thumbnails, result.message);
            // if (response.ok && result.success) {
            // } else {
            //     this.showError(result.error || 'An error occurred while processing the video');
            // }
        } catch (error) {
            console.error('Error:', error);
            this.showError('Network error. Please check your connection and try again.');
        } finally {
            this.setProcessingState(false);
        }
    }

    setProcessingState(processing) {
        const btnText = this.processBtn.querySelector('.btn-text');
        const spinner = this.processBtn.querySelector('.loading-spinner');

        if (processing) {
            btnText.textContent = 'Processing...';
            spinner.style.display = 'flex';
            this.processBtn.disabled = true;
            this.removeFileBtn.disabled = true;
            if (this.trimmerSlider.noUiSlider) {
                this.trimmerSlider.setAttribute('disabled', true);
            }
        } else {
            btnText.textContent = 'Process File';
            spinner.style.display = 'none';
            this.processBtn.disabled = false;
            this.removeFileBtn.disabled = false;
            if (this.trimmerSlider.noUiSlider) {
                this.trimmerSlider.removeAttribute('disabled');
            }
        }
    }

    showResults(images, message) {
        this.resultImageContainer.innerHTML = ''; // Clear previous results

        images.map(image => {
            const imgElement = document.createElement('img');
            imgElement.src = image.src;
            imgElement.alt = 'Detected faces collage';
            this.resultImageContainer.appendChild(imgElement);
        })
        this.resultMessage.textContent = message;
        this.resultsSection.style.display = 'block';
        this.errorSection.style.display = 'none';

        // Store image data for download
        this.downloadBtn.onclick = () => {
            images.map(imageData => {
                const link = document.createElement('a');
                link.href = imageData.src;
                link.download = 'detected_faces.png';
                link.click();
            })
        };
    }

    showError(message) {
        this.errorMessage.textContent = message;
        this.errorSection.style.display = 'block';
        this.resultsSection.style.display = 'none';
    }

    hideError() {
        this.errorSection.style.display = 'none';
    }

    hideResults() {
        this.resultsSection.style.display = 'none';
    }

    retry() {
        this.hideError();
        this.hideResults();
    }

    setupTrimmer(file) {
        this.trimmerSection.style.display = 'block';
        this.videoUrl = URL.createObjectURL(file);
        this.videoPreview.src = this.videoUrl;
    }

    handleVideoMetadata() {
        this.videoDuration = this.videoPreview.duration;
        this.endTime.textContent = this.formatTime(this.videoDuration);

        if (this.trimmerSlider.noUiSlider) {
            this.trimmerSlider.noUiSlider.destroy();
        }

        noUiSlider.create(this.trimmerSlider, {
            start: [0, this.videoDuration],
            connect: true,
            range: {
                'min': 0,
                'max': this.videoDuration
            },
            behaviour: 'drag-tap',
        });

        // Initial thumbnail generation
        this.updateStartAndEndThumbnails(0, this.videoDuration);

        this.trimmerSlider.noUiSlider.on('update', (values) => {
            this.startTime.textContent = this.formatTime(parseFloat(values[0]));
            this.endTime.textContent = this.formatTime(parseFloat(values[1]));
        });

        // Update thumbnails only when user finishes sliding for efficiency
        this.trimmerSlider.noUiSlider.on('change', (values) => {
            const startTime = parseFloat(values[0]);
            const endTime = parseFloat(values[1]);
            this.updateStartAndEndThumbnails(startTime, endTime);
        });

        const showPreview = (e) => {
            const rect = this.trimmerSlider.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const percentage = x / rect.width;
            const time = this.videoDuration * percentage;

            if (time >= 0 && time <= this.videoDuration) {
                this.showThumbnailPreview(time, x);
            }
        };

        this.trimmerSlider.addEventListener('mousemove', showPreview);
        this.trimmerSlider.addEventListener('mouseenter', () => {
            this.thumbnailPreview.style.display = 'block';
        });
        this.trimmerSlider.addEventListener('mouseleave', () => {
            this.thumbnailPreview.style.display = 'none';
        });
    }

    _drawThumbnail(canvas, ctx, displayWidth) {
        const video = this.videoPreview;
        if (!video || video.readyState < 1 || !ctx) return;

        const videoRatio = video.videoWidth / video.videoHeight;
        // Render at 2x for higher quality on high-DPI screens
        const qualityMultiplier = 2;

        canvas.width = displayWidth * qualityMultiplier;
        canvas.height = (displayWidth / videoRatio) * qualityMultiplier;

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    }

    showThumbnailPreview(time, sliderX) {
        if (this.videoPreview.readyState < 1 || !this.thumbnailCtx) return;

        this.videoPreview.currentTime = time;
        this.thumbnailPreview.style.left = `${sliderX}px`;

        this.videoPreview.onseeked = () => {
            this._drawThumbnail(this.thumbnailCanvas, this.thumbnailCtx, 120);
            this.videoPreview.onseeked = null;
        };
    }

    downloadImage() {
        // This will be handled by the onclick event set in showResults
    }

    drawCanvas(canvas, ctx) {
        this._drawThumbnail(canvas, ctx, 90);
    }

    updateStartAndEndThumbnails(startTime, endTime) {
        if (this.isUpdatingThumbnails || this.videoPreview.readyState < 1) return;
        this.isUpdatingThumbnails = true;

        const originalTime = this.videoPreview.currentTime;

        const seekAndDraw = (time, canvas, ctx) => {
            return new Promise(resolve => {
                this.videoPreview.onseeked = () => {
                    this.drawCanvas(canvas, ctx);
                    this.videoPreview.onseeked = null;
                    resolve();
                };
                this.videoPreview.currentTime = time;
            });
        };

        seekAndDraw(startTime, this.startThumbnailCanvas, this.startThumbnailCtx)
            .then(() => seekAndDraw(endTime, this.endThumbnailCanvas, this.endThumbnailCtx))
            .finally(() => {
                // Restore original video position after thumbnails are generated
                this.videoPreview.currentTime = originalTime;
                this.isUpdatingThumbnails = false;
            });
    }

    openZoomModal(time) {
        if (this.videoPreview.readyState < 1) return;

        // Show modal and clear previous image
        this.zoomedImage.src = '';
        this.zoomModal.style.display = 'flex';

        const video = this.videoPreview;
        const originalTime = video.currentTime;

        const showModalWithImage = () => {
            // Create a high-resolution off-screen canvas
            const modalCanvas = document.createElement('canvas');
            const modalCtx = modalCanvas.getContext('2d');

            const videoRatio = video.videoWidth / video.videoHeight;
            const modalWidth = Math.min(video.videoWidth, 1280); // Cap at 1280px or video width
            const modalHeight = modalWidth / videoRatio;

            modalCanvas.width = modalWidth;
            modalCanvas.height = modalHeight;

            modalCtx.imageSmoothingEnabled = true;
            modalCtx.imageSmoothingQuality = 'high';
            modalCtx.drawImage(video, 0, 0, modalWidth, modalHeight);

            this.zoomedImage.src = modalCanvas.toDataURL('image/png');
            this.currentZoom = 1;
            this.zoomedImage.style.transform = 'scale(1)';

            // Restore original video position and remove seeked listener
            video.onseeked = null;
            if (video.currentTime !== originalTime) {
                video.currentTime = originalTime;
            }
        };

        // If the video is already at the correct time, just draw it.
        if (Math.abs(video.currentTime - time) < 0.01) {
            showModalWithImage();
        } else {
            video.onseeked = showModalWithImage;
            video.currentTime = time;
        }
    }

    closeZoomModal() {
        this.zoomModal.style.display = 'none';
    }

    handleZoom(e) {
        e.preventDefault();
        const zoomIntensity = 0.1;
        const delta = e.deltaY > 0 ? -zoomIntensity : zoomIntensity;
        this.currentZoom = Math.max(0.5, this.currentZoom + delta); // Min zoom 0.5x
        this.zoomedImage.style.transform = `scale(${this.currentZoom})`;
        this.zoomedImage.style.cursor = delta > 0 ? 'zoom-in' : 'zoom-out';
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FaceDetectionApp();
});
