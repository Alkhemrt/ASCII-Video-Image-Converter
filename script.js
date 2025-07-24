// Create a Web Worker for ASCII conversion
const workerCode = `
    const charSets = [
        " .,:;+*?%S#@",
        " ░▒▓█",
        " ·-~=+*#%@$",
        " @%#*+=·",
        ""
    ];

    let customPalette = [];

    function hexToRgb(hex) {
        const r = parseInt(hex.substring(1, 3), 16);
        const g = parseInt(hex.substring(3, 5), 16);
        const b = parseInt(hex.substring(5, 7), 16);
        return [r, g, b];
    }

    function applyColorFilter(r, g, b, palette) {
        switch(palette) {
            case 'grayscale':
                const gray = (r * 299 + g * 587 + b * 114) / 1000;
                return [gray, gray, gray];
            case 'sepia':
                const tr = (r * 0.393) + (g * 0.769) + (b * 0.189);
                const tg = (r * 0.349) + (g * 0.686) + (b * 0.168);
                const tb = (r * 0.272) + (g * 0.534) + (b * 0.131);
                return [Math.min(255, tr), Math.min(255, tg), Math.min(255, tb)];
            case 'red':
                return [r, 0, 0];
            case 'green':
                return [0, g, 0];
            case 'blue':
                return [0, 0, b];
            case 'custom':
                if (customPalette.length === 0) return [r, g, b];
                
                // Find closest color in custom palette
                let closestColor = customPalette[0];
                let minDistance = Infinity;
                
                for (const color of customPalette) {
                    const [cr, cg, cb] = color;
                    const distance = Math.sqrt(
                        Math.pow(r - cr, 2) + 
                        Math.pow(g - cg, 2) + 
                        Math.pow(b - cb, 2)
                    );
                    
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestColor = color;
                    }
                }
                
                return closestColor;
            default:
                return [r, g, b];
        }
    }

    function detectEdges(pixels, width, height, threshold, intensity) {
        const edgePixels = new Uint8ClampedArray(pixels.length);
        const thresholdValue = threshold * 2.55; // Convert percentage to 0-255
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const i = (y * width + x) * 4;
                
                // Get surrounding pixels
                const top = (y - 1) * width * 4 + x * 4;
                const bottom = (y + 1) * width * 4 + x * 4;
                const left = y * width * 4 + (x - 1) * 4;
                const right = y * width * 4 + (x + 1) * 4;
                
                // Calculate gradient (Sobel operator simplified)
                const gx = (
                    -pixels[left] + pixels[right] +
                    -2 * pixels[left + 4] + 2 * pixels[right + 4] +
                    -pixels[left + width * 4] + pixels[right + width * 4]
                );
                
                const gy = (
                    -pixels[top] + pixels[bottom] +
                    -2 * pixels[top + 4] + 2 * pixels[bottom + 4] +
                    -pixels[top + width * 4] + pixels[bottom + width * 4]
                );
                
                // Calculate edge strength
                const edgeStrength = Math.min(255, Math.sqrt(gx * gx + gy * gy) * (intensity / 100));
                
                if (edgeStrength > thresholdValue) {
                    edgePixels[i] = edgePixels[i + 1] = edgePixels[i + 2] = 255;
                    edgePixels[i + 3] = 255;
                } else {
                    edgePixels[i] = edgePixels[i + 1] = edgePixels[i + 2] = 0;
                    edgePixels[i + 3] = 255;
                }
            }
        }
        
        return edgePixels;
    }

    self.onmessage = function(e) {
        if (e.data.type === 'updatePalette') {
            customPalette = e.data.palette;
            return;
        }

        const { 
            data, 
            width, 
            height, 
            contrast, 
            brightness, 
            charSetIndex, 
            customChars, 
            isColor, 
            colorPalette, 
            edgeDetection, 
            edgeThreshold, 
            edgeIntensity,
            fontFamily,
            fontSize,
            charSpacingX,
            charSpacingY,
            invertedMode
        } = e.data;
        
        const density = charSetIndex === 4 ? customChars : charSets[charSetIndex];
        if (!density || !density.length) return;

        let ascii = '';
        let pixels = new Uint8ClampedArray(data);

        if (edgeDetection) {
            pixels = detectEdges(pixels, width, height, edgeThreshold, edgeIntensity);
        }

        if (isColor) {
            // Optimized color ASCII mode
            for (let y = 0; y < height; y++) {
                let line = '';
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    let r = pixels[i];
                    let g = pixels[i + 1];
                    let b = pixels[i + 2];

                    // Apply color palette
                    const [fr, fg, fb] = applyColorFilter(r, g, b, colorPalette);
                    r = fr;
                    g = fg;
                    b = fb;

                    // Fast grayscale conversion
                    let gray = (r * 299 + g * 587 + b * 114) / 1000;

                    // Apply contrast and brightness
                    gray = ((gray - 127.5) * (contrast / 100)) + 127.5 + (brightness - 100);
                    gray = Math.max(0, Math.min(255, gray));

                    // Find closest character
                    const charIndex = Math.min(density.length - 1, Math.floor((gray / 255) * density.length));
                    const char = density.charAt(charIndex);

                    // Use template string for color
                    line += \`<span style="color:rgb(\${r},\${g},\${b})">\${char}</span>\`;
                }
                ascii += line + '<br>';
            }
        } else {
            // Grayscale mode
            for (let y = 0; y < height; y++) {
                let line = '';
                for (let x = 0; x < width; x++) {
                    const i = (y * width + x) * 4;
                    const r = pixels[i];
                    const g = pixels[i + 1];
                    const b = pixels[i + 2];

                    // Fast grayscale conversion
                    let gray = (r * 299 + g * 587 + b * 114) / 1000;

                    // Apply contrast and brightness
                    gray = ((gray - 127.5) * (contrast / 100)) + 127.5 + (brightness - 100);
                    gray = Math.max(0, Math.min(255, gray));

                    const charIndex = Math.floor((gray / 255) * (density.length - 1));
                    line += density.charAt(charIndex);
                }
                ascii += line + '\\n';
            }
        }

        self.postMessage({ 
            ascii, 
            isColor,
            fontFamily,
            fontSize,
            charSpacingX,
            charSpacingY,
            invertedMode
        });
    };
`;

const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
const workerUrl = URL.createObjectURL(workerBlob);
const asciiWorker = new Worker(workerUrl);

// DOM Elements
const video = document.getElementById('video');
const videoPlaceholder = document.getElementById('videoPlaceholder');
const asciiArt = document.getElementById('asciiArt');
const fileUpload = document.getElementById('fileUpload');
const imageUpload = document.getElementById('imageUpload');
const uploadLabel = document.getElementById('uploadLabel');
const imageUploadLabel = document.getElementById('imageUploadLabel');
const fileName = document.getElementById('fileName');
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const captureBtn = document.getElementById('captureBtn');
const contrastSlider = document.getElementById('contrastSlider');
const brightnessSlider = document.getElementById('brightnessSlider');
const resolutionSlider = document.getElementById('resolutionSlider');
const resolutionValue = document.getElementById('resolutionValue');
const contrastValue = document.getElementById('contrastValue');
const brightnessValue = document.getElementById('brightnessValue');
const charSetSelect = document.getElementById('charSetSelect');
const customChars = document.getElementById('customChars');
const colorToggle = document.getElementById('colorToggle');
const colorPalette = document.getElementById('colorPalette');
const colorPaletteContainer = document.getElementById('colorPaletteContainer');
const edgeToggle = document.getElementById('edgeToggle');
const edgeSettings = document.getElementById('edgeSettings');
const edgeThreshold = document.getElementById('edgeThreshold');
const edgeIntensity = document.getElementById('edgeIntensity');
const edgeThresholdValueDisplay = document.getElementById('edgeThresholdValue');
const edgeIntensityValueDisplay = document.getElementById('edgeIntensityValue');
const fpsCounter = document.getElementById('fpsCounter');
const asciiOutput = document.querySelector('.ascii-output');
const autoAdjustBtn = document.getElementById('autoAdjustBtn');
const autoCharsBtn = document.getElementById('autoCharsBtn');
const settingsToggle = document.getElementById('settingsToggle');
const advancedSettings = document.getElementById('advancedSettings');
const closeAdvancedSettings = document.getElementById('closeAdvancedSettings');
const fpsLimit = document.getElementById('fpsLimit');
const fpsLimitValue = document.getElementById('fpsLimitValue');
const imageCanvas = document.getElementById('imageCanvas');
const imageCtx = imageCanvas.getContext('2d', { willReadFrequently: true });
const fontSizeSlider = document.getElementById('fontSizeSlider');
const fontSizeValue = document.getElementById('fontSizeValue');
const charSpacingX = document.getElementById('charSpacingX');
const charSpacingY = document.getElementById('charSpacingY');
const charSpacingXValue = document.getElementById('charSpacingXValue');
const charSpacingYValue = document.getElementById('charSpacingYValue');
const fontFamilySelect = document.getElementById('fontFamilySelect');
const customPaletteSection = document.getElementById('customPaletteSection');
const colorPicker = document.getElementById('colorPicker');
const palettePreview = document.getElementById('palettePreview');
const addColorBtn = document.getElementById('addColorBtn');
const resetPaletteBtn = document.getElementById('resetPaletteBtn');
const invertedToggle = document.getElementById('invertedToggle');

// ASCII Configuration
let contrast = 100;
let brightness = 100;
let resolution = 100;
let charSetIndex = 0;
let isColor = false;
let colorPaletteValue = 'full';
let customCharSet = "";
let edgeDetection = false;
let edgeThresholdSetting = 50;
let edgeIntensitySetting = 100;
let targetFPS = 30;
let frameTimes = [];
let lastFpsUpdate = 0;
let isImageMode = false;
let customPaletteColors = [];
let invertedMode = false;

// Character set options
let fontSize = 8;
let charSpacingXValueSetting = 0;
let charSpacingYValueSetting = 0;
let fontFamily = 'monospace';

// Canvas setup
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const analysisCanvas = document.createElement('canvas');
const analysisCtx = analysisCanvas.getContext('2d', { willReadFrequently: true });

// Animation control
let animationId = null;
let lastFrameTime = 0;

// Event Listeners
fileUpload.addEventListener('change', handleFileUpload);
imageUpload.addEventListener('change', handleImageUpload);
playBtn.addEventListener('click', playVideo);
pauseBtn.addEventListener('click', pauseVideo);
fullscreenBtn.addEventListener('click', toggleFullscreen);
captureBtn.addEventListener('click', captureFrame);
contrastSlider.addEventListener('input', updateContrast);
brightnessSlider.addEventListener('input', updateBrightness);
resolutionSlider.addEventListener('input', updateResolution);
charSetSelect.addEventListener('change', updateCharSet);
customChars.addEventListener('input', updateCustomChars);
colorToggle.addEventListener('change', toggleColorMode);
colorPalette.addEventListener('change', updateColorPalette);
edgeToggle.addEventListener('change', toggleEdgeDetection);
edgeThreshold.addEventListener('input', updateEdgeThreshold);
edgeIntensity.addEventListener('input', updateEdgeIntensity);
video.addEventListener('ended', handleVideoEnd);
autoAdjustBtn.addEventListener('click', autoAdjustSettings);
autoCharsBtn.addEventListener('click', autoAdjustCharacterSet);
settingsToggle.addEventListener('click', toggleAdvancedSettings);
closeAdvancedSettings.addEventListener('click', toggleAdvancedSettings);
fpsLimit.addEventListener('input', updateFpsLimit);
fontSizeSlider.addEventListener('input', updateFontSize);
charSpacingX.addEventListener('input', updateCharSpacingX);
charSpacingY.addEventListener('input', updateCharSpacingY);
fontFamilySelect.addEventListener('change', updateFontFamily);
addColorBtn.addEventListener('click', addColorToPalette);
resetPaletteBtn.addEventListener('click', resetPalette);
invertedToggle.addEventListener('change', toggleInvertedMode);

// Initialize custom palette
function initCustomPalette() {
    // Default palette
    customPaletteColors = [
        [255, 0, 0],     // Red
        [0, 255, 0],     // Green
        [0, 0, 255],     // Blue
        [255, 255, 0],   // Yellow
        [255, 0, 255],   // Magenta
        [0, 255, 255],   // Cyan
        [255, 255, 255], // White
        [0, 0, 0]        // Black
    ];
    updatePalettePreview();
    updateWorkerPalette();
}

function addColorToPalette() {
    const hexColor = colorPicker.value;
    const r = parseInt(hexColor.substring(1, 3), 16);
    const g = parseInt(hexColor.substring(3, 5), 16);
    const b = parseInt(hexColor.substring(5, 7), 16);
    customPaletteColors.push([r, g, b]);
    
    updatePalettePreview();
    updateWorkerPalette();
    renderASCIIFrame();
}

function resetPalette() {
    initCustomPalette();
    renderASCIIFrame();
}

function updatePalettePreview() {
    palettePreview.innerHTML = '';
    customPaletteColors.forEach((color, index) => {
        const colorDiv = document.createElement('div');
        colorDiv.className = 'palette-color';
        colorDiv.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;
        colorDiv.title = `RGB: ${color[0]}, ${color[1]}, ${color[2]}`;
        colorDiv.addEventListener('click', () => {
            customPaletteColors.splice(index, 1);
            updatePalettePreview();
            updateWorkerPalette();
            renderASCIIFrame();
        });
        palettePreview.appendChild(colorDiv);
    });
}

function updateWorkerPalette() {
    asciiWorker.postMessage({
        type: 'updatePalette',
        palette: customPaletteColors
    });
}

// Worker response handler
asciiWorker.onmessage = function(e) {
    if (e.data.isColor) {
        asciiArt.innerHTML = e.data.ascii;
    } else {
        asciiArt.textContent = e.data.ascii;
    }

    // Apply font and spacing settings
    asciiArt.style.fontFamily = e.data.fontFamily || 'monospace';
    asciiArt.style.fontSize = `${e.data.fontSize || 8}px`;
    asciiArt.style.letterSpacing = `${e.data.charSpacingX || 0}px`;
    asciiArt.style.lineHeight = `${(e.data.fontSize || 8) + (e.data.charSpacingY || 0)}px`;

    // Apply inverted mode if needed
    if (e.data.invertedMode) {
        asciiOutput.classList.add('inverted-mode');
    } else {
        asciiOutput.classList.remove('inverted-mode');
    }

    // FPS calculation
    const now = performance.now();
    frameTimes.push(now);
    while (frameTimes.length > 0 && now - frameTimes[0] > 1000) {
        frameTimes.shift();
    }
    const fps = frameTimes.length;

    // Only update FPS counter once per second to reduce jitter
    if (now - lastFpsUpdate > 1000) {
        fpsCounter.textContent = `FPS: ${fps}`;
        lastFpsUpdate = now;
    }
};

function captureFrame() {
    if (!asciiArt.textContent && !asciiArt.innerHTML) return;

    // Create a temporary container to render the ASCII art with all styles
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.whiteSpace = 'pre';
    tempContainer.style.fontFamily = asciiArt.style.fontFamily || 'monospace';
    tempContainer.style.fontSize = asciiArt.style.fontSize || '8px';
    tempContainer.style.letterSpacing = asciiArt.style.letterSpacing || '0px';
    tempContainer.style.lineHeight = asciiArt.style.lineHeight || '8px';
    tempContainer.style.backgroundColor = invertedMode ? 'white' : 'black';
    tempContainer.style.color = invertedMode ? 'black' : 'white';
    tempContainer.style.padding = '10px';
    
    // Clone the ASCII content
    if (isColor) {
        tempContainer.innerHTML = asciiArt.innerHTML;
    } else {
        tempContainer.textContent = asciiArt.textContent;
    }
    
    document.body.appendChild(tempContainer);

    // Use html2canvas to capture the styled ASCII art
    html2canvas(tempContainer, {
        backgroundColor: invertedMode ? 'white' : 'black',
        scale: 2, // Higher quality
        logging: false,
        useCORS: true
    }).then(canvas => {
        // Create download link
        const link = document.createElement('a');
        link.download = 'ascii-capture-' + new Date().toISOString().slice(0, 10) + '.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
        
        // Clean up
        document.body.removeChild(tempContainer);
    }).catch(err => {
        console.error('Error capturing frame:', err);
        document.body.removeChild(tempContainer);
        
        // Fallback for browsers that don't support html2canvas
        const text = isColor ? asciiArt.innerHTML : asciiArt.textContent;
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.download = 'ascii-capture-' + new Date().toISOString().slice(0, 10) + '.txt';
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
    });
}

function toggleInvertedMode() {
    invertedMode = invertedToggle.checked;
    
    // Disable color mode if inverted mode is enabled
    if (invertedMode) {
        isColor = false;
        colorToggle.checked = false;
        colorPaletteContainer.classList.remove('palette-enabled');
        colorPaletteContainer.classList.add('palette-disabled');
    }
    
    renderASCIIFrame();
}

function updateFontSize(e) {
    fontSize = parseInt(e.target.value);
    fontSizeValue.textContent = fontSize;
    renderASCIIFrame();
}

function updateCharSpacingX(e) {
    charSpacingXValueSetting = parseInt(e.target.value);
    charSpacingXValue.textContent = charSpacingXValueSetting;
    renderASCIIFrame();
}

function updateCharSpacingY(e) {
    charSpacingYValueSetting = parseInt(e.target.value);
    charSpacingYValue.textContent = charSpacingYValueSetting;
    renderASCIIFrame();
}

function updateFontFamily(e) {
    fontFamily = e.target.value;
    renderASCIIFrame();
}

function toggleEdgeDetection() {
    edgeDetection = edgeToggle.checked;
    edgeSettings.style.display = edgeDetection ? 'block' : 'none';
    renderASCIIFrame();
}

function updateEdgeThreshold(e) {
    edgeThresholdSetting = parseInt(e.target.value);
    edgeThresholdValueDisplay.textContent = edgeThresholdSetting;
    renderASCIIFrame();
}

function updateEdgeIntensity(e) {
    edgeIntensitySetting = parseInt(e.target.value);
    edgeIntensityValueDisplay.textContent = edgeIntensitySetting;
    renderASCIIFrame();
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (file) {
        isImageMode = false;
        uploadLabel.textContent = "Change Video";
        fileName.textContent = file.name;
        fileName.style.display = 'block';

        const videoURL = URL.createObjectURL(file);
        video.src = videoURL;
        video.load();

        video.onloadeddata = () => {
            video.style.display = 'block';
            imageCanvas.style.display = 'none';
            videoPlaceholder.style.display = 'none';
            playBtn.disabled = false;
            pauseBtn.disabled = false;
            renderASCIIFrame();
        };
    }
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        isImageMode = true;
        imageUploadLabel.textContent = "Change Image";
        fileName.textContent = file.name;
        fileName.style.display = 'block';

        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                const maxWidth = 400;
                const maxHeight = 200;
                let width = img.width;
                let height = img.height;

                // Maintain aspect ratio
                if (width > maxWidth) {
                    height = (maxWidth / width) * height;
                    width = maxWidth;
                }
                if (height > maxHeight) {
                    width = (maxHeight / height) * width;
                    height = maxHeight;
                }

                imageCanvas.width = width;
                imageCanvas.height = height;
                imageCtx.drawImage(img, 0, 0, width, height);
                
                video.style.display = 'none';
                imageCanvas.style.display = 'block';
                videoPlaceholder.style.display = 'none';
                playBtn.disabled = true;
                pauseBtn.disabled = true;
                renderASCIIFrame();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function playVideo() {
    if (isImageMode) return;
    
    video.play();
    startProcessing();
    playBtn.disabled = true;
    pauseBtn.disabled = false;
}

function pauseVideo() {
    if (isImageMode) return;
    
    video.pause();
    stopProcessing();
    playBtn.disabled = false;
    pauseBtn.disabled = true;
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        asciiOutput.requestFullscreen().catch(err => {
            console.error(`Error attempting to enable fullscreen: ${err.message}`);
        });
        fullscreenBtn.textContent = 'Exit Fullscreen';
    } else {
        document.exitFullscreen();
        fullscreenBtn.textContent = 'Fullscreen';
    }
}

function handleVideoEnd() {
    video.currentTime = 0;
    video.play();
}

function updateContrast(e) {
    contrast = parseInt(e.target.value);
    contrastValue.textContent = contrast;
    renderASCIIFrame();
}

function updateBrightness(e) {
    brightness = parseInt(e.target.value);
    brightnessValue.textContent = brightness;
    renderASCIIFrame();
}

function updateResolution(e) {
    resolution = parseInt(e.target.value);
    resolutionValue.textContent = resolution;
    renderASCIIFrame();
}

function updateCharSet(e) {
    charSetIndex = parseInt(e.target.value);
    customChars.style.display = charSetIndex === 4 ? 'block' : 'none';
    renderASCIIFrame();
}

function updateCustomChars() {
    customCharSet = customChars.value;
    renderASCIIFrame();
}

function toggleColorMode() {
    isColor = colorToggle.checked;
    
    // Disable inverted mode if color mode is enabled
    if (isColor && invertedMode) {
        invertedMode = false;
        invertedToggle.checked = false;
        asciiOutput.classList.remove('inverted-mode');
    }
    
    if (isColor) {
        colorPaletteContainer.classList.remove('palette-disabled');
        colorPaletteContainer.classList.add('palette-enabled');
    } else {
        colorPaletteContainer.classList.remove('palette-enabled');
        colorPaletteContainer.classList.add('palette-disabled');
    }
    renderASCIIFrame();
}

function updateColorPalette() {
    colorPaletteValue = colorPalette.value;
    customPaletteSection.style.display = colorPaletteValue === 'custom' ? 'block' : 'none';
    renderASCIIFrame();
}

function toggleAdvancedSettings() {
    advancedSettings.classList.toggle('show');
}

function updateFpsLimit(e) {
    targetFPS = parseInt(e.target.value);
    fpsLimitValue.textContent = targetFPS;
    if (!isImageMode) {
        stopProcessing();
        startProcessing();
    }
}

function startProcessing() {
    if (animationId) cancelAnimationFrame(animationId);

    const processFrame = (timestamp) => {
        const frameInterval = 1000 / targetFPS;

        if (timestamp - lastFrameTime >= frameInterval) {
            lastFrameTime = timestamp - ((timestamp - lastFrameTime) % frameInterval);
            if (!video.paused && !video.ended) {
                renderASCIIFrame();
            }
        }

        animationId = requestAnimationFrame(processFrame);
    };

    animationId = requestAnimationFrame(processFrame);
}

function stopProcessing() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
}

function autoAdjustSettings() {
    if ((isImageMode && !imageCanvas.width) || (!isImageMode && video.readyState < 2)) return;

    // Create a smaller canvas for analysis to improve performance
    const width = isImageMode ? imageCanvas.width : video.videoWidth;
    const height = isImageMode ? imageCanvas.height : video.videoHeight;
    
    if (!width || !height) return;
    
    analysisCanvas.width = Math.min(100, width);
    analysisCanvas.height = Math.min(100, height);
    
    if (isImageMode) {
        analysisCtx.drawImage(imageCanvas, 0, 0, width, height, 0, 0, analysisCanvas.width, analysisCanvas.height);
    } else {
        analysisCtx.drawImage(video, 0, 0, width, height, 0, 0, analysisCanvas.width, analysisCanvas.height);
    }
    
    const imageData = analysisCtx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
    const data = imageData.data;
    
    // Calculate histogram and statistics
    let sum = 0;
    let min = 255;
    let max = 0;
    const histogram = new Array(256).fill(0);
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const gray = Math.round((r * 299 + g * 587 + b * 114) / 1000);
        
        histogram[gray]++;
        sum += gray;
        min = Math.min(min, gray);
        max = Math.max(max, gray);
    }
    
    const mean = sum / (data.length / 4);
    const range = max - min;
    
    // Calculate contrast stretch parameters
    let targetMin = 0;
    let targetMax = 255;
    
    // Find 5th and 95th percentiles to ignore extreme values
    let count = 0;
    let lowPercentile = 0;
    let highPercentile = 255;
    const totalPixels = (data.length / 4);
    
    for (let i = 0; i < 256; i++) {
        count += histogram[i];
        if (lowPercentile === 0 && count >= totalPixels * 0.05) {
            lowPercentile = i;
        }
        if (count >= totalPixels * 0.95) {
            highPercentile = i;
            break;
        }
    }
    
    // Calculate desired contrast and brightness
    const currentRange = highPercentile - lowPercentile;
    const desiredContrast = Math.min(150, Math.max(50, (255 / currentRange) * 100));
    const desiredBrightness = Math.min(150, Math.max(50, 100 + (127.5 - (lowPercentile + currentRange / 2)) / 2.55));
    
    // Apply the new settings with smooth transition
    const steps = 10;
    const contrastStep = (desiredContrast - contrast) / steps;
    const brightnessStep = (desiredBrightness - brightness) / steps;
    
    let step = 0;
    const transition = setInterval(() => {
        if (step >= steps) {
            clearInterval(transition);
            return;
        }
        
        contrast += contrastStep;
        brightness += brightnessStep;
        
        contrastSlider.value = Math.round(contrast);
        brightnessSlider.value = Math.round(brightness);
        
        contrastValue.textContent = Math.round(contrast);
        brightnessValue.textContent = Math.round(brightness);
        
        renderASCIIFrame();
        step++;
    }, 50);
}

function autoAdjustCharacterSet() {
    if ((isImageMode && !imageCanvas.width) || (!isImageMode && video.readyState < 2)) return;

    const width = isImageMode ? imageCanvas.width : video.videoWidth;
    const height = isImageMode ? imageCanvas.height : video.videoHeight;
    
    if (!width || !height) return;
    
    // Create a smaller canvas for analysis
    analysisCanvas.width = Math.min(100, width);
    analysisCanvas.height = Math.min(100, height);
    
    if (isImageMode) {
        analysisCtx.drawImage(imageCanvas, 0, 0, width, height, 0, 0, analysisCanvas.width, analysisCanvas.height);
    } else {
        analysisCtx.drawImage(video, 0, 0, width, height, 0, 0, analysisCanvas.width, analysisCanvas.height);
    }
    
    const imageData = analysisCtx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height);
    const data = imageData.data;
    
    // Calculate histogram of pixel intensities
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const gray = Math.round((r * 299 + g * 587 + b * 114) / 1000);
        histogram[gray]++;
    }
    
    // Calculate cumulative distribution
    const cdf = new Array(256).fill(0);
    cdf[0] = histogram[0];
    for (let i = 1; i < 256; i++) {
        cdf[i] = cdf[i - 1] + histogram[i];
    }
    
    // Find the most common intensity ranges
    const ranges = [];
    for (let i = 0; i < 256; i += 16) {
        const end = Math.min(i + 16, 255);
        const count = cdf[end] - (i > 0 ? cdf[i - 1] : 0);
        ranges.push({ start: i, end, count });
    }
    
    // Sort by most common ranges
    ranges.sort((a, b) => b.count - a.count);
    
    // Define possible character sets for different scenarios
    const charSetOptions = {
        highContrast: "@%#*+=-:. ",
        smoothGradient: "█▓▒░· ",
        detailed: " .:-=+*#%@",
        balanced: " .'`^\",:;+*?%S#@",
        edgeFocused: "·-~=+*#%@$"
    };
    
    // Analyze the image to determine the best character set
    let selectedChars = charSetOptions.balanced; // default
    
    // Check if image has high contrast (many very dark and very light pixels)
    const darkPixels = cdf[63] - cdf[0]; // pixels 0-63
    const lightPixels = cdf[255] - cdf[191]; // pixels 192-255
    const isHighContrast = (darkPixels > (data.length / 8) && lightPixels > (data.length / 8));
    
    // Check if image is mostly midtones
    const midPixels = cdf[191] - cdf[64]; // pixels 64-191
    const isMostlyMidtones = midPixels > (data.length / 2);
    
    if (isHighContrast) {
        selectedChars = charSetOptions.highContrast;
    } else if (isMostlyMidtones) {
        selectedChars = charSetOptions.detailed;
    }
    
    // If edge detection is enabled, use edge-focused characters
    if (edgeDetection) {
        selectedChars = charSetOptions.edgeFocused;
    }
    
    // Apply the selected character set
    customCharSet = selectedChars;
    charSetSelect.value = "4";
    customChars.value = selectedChars;
    customChars.style.display = 'block';
    charSetIndex = 4;
    
    renderASCIIFrame();
}

function renderASCIIFrame() {
    if ((isImageMode && !imageCanvas.width) || (!isImageMode && video.readyState < 2)) return;

    const width = isImageMode ? imageCanvas.width : video.videoWidth;
    const height = isImageMode ? imageCanvas.height : video.videoHeight;

    if (width && height) {
        const container = document.querySelector('.ascii-output');
        const baseWidth = Math.min(160, Math.floor(container.clientWidth / 5));
        const scaledWidth = Math.floor(baseWidth * (resolution / 100));
        const asciiWidth = Math.max(20, Math.min(300, scaledWidth));
        const asciiHeight = Math.floor(asciiWidth * (height / width) * 0.45);

        canvas.width = asciiWidth;
        canvas.height = asciiHeight;

        ctx.filter = `contrast(${contrast}%) brightness(${brightness}%)`;
        
        if (isImageMode) {
            ctx.drawImage(imageCanvas, 0, 0, width, height, 0, 0, asciiWidth, asciiHeight);
        } else {
            ctx.drawImage(video, 0, 0, width, height, 0, 0, asciiWidth, asciiHeight);
        }
        
        ctx.filter = 'none';

        const imageData = ctx.getImageData(0, 0, asciiWidth, asciiHeight);

        // Send data to worker for processing
        asciiWorker.postMessage({
            data: imageData.data.buffer,
            width: asciiWidth,
            height: asciiHeight,
            contrast: contrast,
            brightness: brightness,
            charSetIndex: charSetIndex,
            customChars: customCharSet,
            isColor: isColor,
            colorPalette: colorPaletteValue,
            edgeDetection: edgeDetection,
            edgeThreshold: edgeThresholdSetting,
            edgeIntensity: edgeIntensitySetting,
            fontFamily: fontFamily,
            fontSize: fontSize,
            charSpacingX: charSpacingXValueSetting,
            charSpacingY: charSpacingYValueSetting,
            invertedMode: invertedMode
        }, [imageData.data.buffer]);
    }
}

// Handle window resize
const resizeObserver = new ResizeObserver(() => {
    if ((isImageMode && imageCanvas.width) || (!isImageMode && video.videoWidth)) {
        renderASCIIFrame();
    }
});

resizeObserver.observe(document.querySelector('.ascii-output'));

// Handle fullscreen change
document.addEventListener('fullscreenchange', () => {
    fullscreenBtn.textContent = document.fullscreenElement ? 'Exit Fullscreen' : 'Fullscreen';
});

// Initialize the app
initCustomPalette();

// Clean up
window.addEventListener('beforeunload', () => {
    if (animationId) cancelAnimationFrame(animationId);
    if (video.src) URL.revokeObjectURL(video.src);
    asciiWorker.terminate();
    URL.revokeObjectURL(workerUrl);
});