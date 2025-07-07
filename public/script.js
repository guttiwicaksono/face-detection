class FaceDetectionApp {
    constructor() {
        this.selectedFile = null;
        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
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
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    async processFile() {
        if (!this.selectedFile) return;

        this.setProcessingState(true);
        this.hideError();
        this.hideResults();

        try {
            const formData = new FormData();
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
        } else {
            btnText.textContent = 'Process File';
            spinner.style.display = 'none';
            this.processBtn.disabled = false;
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

    downloadImage() {
        // This will be handled by the onclick event set in showResults
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new FaceDetectionApp();
});
