// Tab switching functionality
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Remove active class from all buttons and contents
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        // Add active class to clicked button and corresponding content
        btn.classList.add('active');
        document.getElementById(`${btn.dataset.tab}-input`).classList.add('active');
    });
});

// File drag and drop functionality
const dropZone = document.querySelector('.file-drop-zone');
const fileInput = document.getElementById('file-upload');

['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, unhighlight, false);
});

function highlight(e) {
    dropZone.classList.add('highlight');
}

function unhighlight(e) {
    dropZone.classList.remove('highlight');
}

dropZone.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
}

fileInput.addEventListener('change', function() {
    handleFiles(this.files);
});

function handleFiles(files) {
    const file = files[0];
    if (file) {
        if (file.size > 10 * 1024 * 1024) { // 10MB limit
            alert('File is too large. Maximum size is 10MB.');
            return;
        }
        
        const validTypes = ['.txt', '.pdf', '.doc', '.docx'];
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        
        if (!validTypes.includes(fileExtension)) {
            alert('Invalid file type. Please upload a PDF, TXT, DOC, or DOCX file.');
            return;
        }
        
        // Show file name in the drop zone
        const fileInfo = document.createElement('p');
        fileInfo.textContent = `Selected file: ${file.name}`;
        dropZone.querySelector('.file-info').replaceWith(fileInfo);
    }
}

// Summarize functionality
const summarizeBtn = document.getElementById('summarize-btn');
const outputContainer = document.querySelector('.output-container');
const summaryContent = document.querySelector('.summary-content');

summarizeBtn.addEventListener('click', async () => {
    const activeTab = document.querySelector('.tab-btn.active').dataset.tab;
    const summaryLength = document.getElementById('summary-length').value;
    let content;
    
    if (activeTab === 'text') {
        content = document.querySelector('textarea').value.trim();
        if (!content) {
            alert('Please enter some text to summarize.');
            return;
        }
    } else {
        const file = fileInput.files[0];
        if (!file) {
            alert('Please select a file to summarize.');
            return;
        }
        // Here you would handle file reading and processing
        // For now, we'll just show a placeholder
        content = `Processing file: ${file.name}`;
    }
    
    // Show loading state
    summarizeBtn.disabled = true;
    summarizeBtn.textContent = 'Summarizing...';
    
    try {
        let response;
        
        if (activeTab === 'text') {
            response = await fetch('http://localhost:3000/api/summarize/text', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    text: content,
                    length: summaryLength
                })
            });
        } else {
            const file = fileInput.files[0];
            if (!file) {
                throw new Error('No file selected');
            }

            const formData = new FormData();
            formData.append('file', file);
            formData.append('length', summaryLength);
            
            response = await fetch('http://localhost:3000/api/summarize/file', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to process file');
            }
        }
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Failed to generate summary');
        }
        
        // Show the result
        outputContainer.style.display = 'block';
        summaryContent.textContent = data.summary;
    } catch (error) {
        console.error('Error:', error);
        alert(error.message || 'Error generating summary. Please try again.');
        outputContainer.style.display = 'none';
        summaryContent.textContent = '';
    } finally {
        summarizeBtn.disabled = false;
        summarizeBtn.textContent = 'Summarize';
        // Reset file input if there was an error
        if (activeTab === 'file') {
            fileInput.value = '';
            const fileInfoElement = dropZone.querySelector('.file-info');
            if (fileInfoElement) {
                const fileInfo = document.createElement('p');
                fileInfo.textContent = 'Drag & drop a file here or click to select';
                fileInfo.className = 'file-info';
                fileInfoElement.replaceWith(fileInfo);
            }
        }
    }
});

// Copy and Download functionality
const copyBtn = document.getElementById('copy-btn');
const downloadBtn = document.getElementById('download-btn');

copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(summaryContent.textContent)
        .then(() => {
            const originalText = copyBtn.innerHTML;
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
                copyBtn.innerHTML = originalText;
            }, 2000);
        })
        .catch(() => alert('Failed to copy text.'));
});

downloadBtn.addEventListener('click', () => {
    const text = summaryContent.textContent;
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'summary.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});
