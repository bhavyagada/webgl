import { createRenderer, resizeRenderer, clearRenderer, loadToolbarTexture, renderSegmentMask, createImage, renderImage, isPointInToolbar, getClickedButton, renderCropOverlay, renderDepthSlider } from './renderer';
import backIcon from './icons/moveback.svg';
import flipIcon from './icons/flip.svg';
import duplicateIcon from './icons/duplicate.svg';
import segmentIcon from './icons/segment.svg';
import downloadIcon from './icons/download.svg';
import deleteIcon from './icons/delete.svg';
import cropIcon from './icons/crop.svg';
import dptIcon from './icons/dpt.svg';

const dptworker = new Worker('dptworker.js', { type: 'module' });
const worker = new Worker('worker.js', { type: 'module' });
const toolbar = { buttonWidth: 30, buttonHeight: 30, gap: 15, buttonTextures: [] };
const canvas = document.querySelector("#c");
const gl = canvas.getContext("webgl2");
if (!gl) throw new Error("WebGL2 not supported!");
const renderer = createRenderer(canvas, gl);
const handleSize = 10;

let scene = [];
let history = [];
let mouseX = 0;
let mouseY = 0;
let needsRender = true;
let selectedImage = null;
let isDragging = false;
let isResizing = false;
let resizeHandle = '';
let lastMouseX = 0;
let lastMouseY = 0;
let panOffsetX = 0;
let panOffsetY = 0;
let isCropping = false;
let isDraggingCropHandle = false;
let selectedCropHandle = null;
// SAM State variables
let isSegmenting = false;
let currentMask = null;
let isDecoding = false;
let isEmbeddingInProgress = false;
// DPT State variables
let isSliderDragging = false;
let isDepthSliderVisible = false;

dptworker.onmessage = (e) => {
  const { type, data, imageId } = e.data;
  if (type === 'ready') console.log('Depth estimation worker is ready');
  else if (type === 'depth_result') {
    if (data === 'start') console.log('Starting depth estimation');
    else {
      console.log('Depth estimation complete');
      const image = scene.find(img => img.id === imageId);
      if (image) {
        image.depthData = data.depth;
        image.isEstimatingDepth = false;
        needsRender = true;
      }
    }
  } else if (type === 'error') {
    console.error('Error in depth estimation:', data);
    const image = scene.find(img => img.id === imageId);
    if (image) image.isEstimatingDepth = false;
  }
};

worker.onmessage = (e) => {
  const { type, data } = e.data;
  if (type === 'ready') console.log('model loaded!');
  else if (type === 'segment_result') {
    if (data === 'start') {
      console.log('extracting image embedding...');
      isEmbeddingInProgress = true;
      document.body.style.cursor = 'wait';
    } else {
      console.log('embedding extracted!');
      isEmbeddingInProgress = false;
      document.body.style.cursor = 'default';
      needsRender = true;
    }
  } else if (type === 'decode_result') handleDecodeResult(data);
};

export const init = () => {
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd, { passive: false });
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mouseup', onMouseUp);
	canvas.addEventListener('wheel', onWheel);
  document.addEventListener('paste', onPaste);
  document.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', onResize);

  const img = new Image();
	const xhr = new XMLHttpRequest();
	xhr.onload = () => {
    const reader = new FileReader();
    reader.onloadend = () => {
			img.onload = () => {
				const image = createImage(renderer, img, renderer.canvas.width / 2, renderer.canvas.height / 2);
				scene.push(image);
				history.push({ type: 'add', image: image });
				needsRender = true;
        estimateDepth(image);
			};
			img.src = reader.result;
		};
    reader.readAsDataURL(xhr.response);
  };
	xhr.open('GET', 'https://www.jockostore.com/cdn/shop/t/33/assets/popup-image.jpg?v=142777728587095439201637241641');
  xhr.responseType = 'blob';
  xhr.send();

  loadToolbarTexture(gl, [backIcon, flipIcon, duplicateIcon, segmentIcon, downloadIcon, deleteIcon, cropIcon, dptIcon]).then((textures) => {
    toolbar.buttonTextures = textures;
    needsRender = true;
  });

  onResize();
  render();
};

const createTempCanvas = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  return [canvas, ctx];
}

const getImageAtPosition = (x, y) => {
  const handleSize = 10;
  for (let i = scene.length - 1; i >= 0; i--) {
    const img = scene[i];
    if (x >= img.x - img.width / 2 - handleSize / 2 && x <= img.x + img.width / 2 + handleSize / 2 && 
      y >= img.y - img.height / 2 - handleSize / 2 && y <= img.y + img.height / 2 + handleSize / 2) {
      return img;
    }
  }
  return null;
};

const getResizeHandle = (x, y, image) => {
  const handleSize = 10;
  const left = image.x - image.width / 2;
  const right = image.x + image.width / 2;
  const top = image.y - image.height / 2;
  const bottom = image.y + image.height / 2;

  if (Math.abs(x - left) < handleSize) {
    if (Math.abs(y - top) < handleSize) return 'nw';
    if (Math.abs(y - bottom) < handleSize) return 'sw';
    if (y > top && y < bottom) return 'w';
  }
  if (Math.abs(x - right) < handleSize) {
    if (Math.abs(y - top) < handleSize) return 'ne';
    if (Math.abs(y - bottom) < handleSize) return 'se';
    if (y > top && y < bottom) return 'e';
  }
  if (Math.abs(y - top) < handleSize && x > left && x < right) return 'n';
  if (Math.abs(y - bottom) < handleSize && x > left && x < right) return 's';
  return '';
};

const handleDecodeResult = (data) => {
  const { mask, scores } = data;
  currentMask = { mask, scores };

  const [maskCanvas, ctx] = createTempCanvas(selectedImage.width, selectedImage.height);
  const imageData = ctx.createImageData(maskCanvas.width, maskCanvas.height);

  const numMasks = scores.length;
  let bestIndex = 0;
  for (let i = 1; i < numMasks; ++i) {
    if (scores[i] > scores[bestIndex]) bestIndex = i;
  }

  const pixelData = imageData.data;
  for (let i = 0; i < pixelData.length / 4; ++i) {
    if (mask.data[numMasks * i + bestIndex] === 1) {
      const offset = 4 * i;
      pixelData[offset] = 0; // red
      pixelData[offset + 1] = 114; // green
      pixelData[offset + 2] = 189; // blue
      pixelData[offset + 3] = 128; // alpha (semi-transparent)
    }
  }
  ctx.putImageData(imageData, 0, 0);

  selectedImage.maskCanvas = maskCanvas;
  needsRender = true;
  isDecoding = false;
};

const segmentImage = async () => {
  if (!worker) {
    console.error('model not loaded');
    return;
  }
  isSegmenting = true;

  const [canvas, ctx] = createTempCanvas(selectedImage.width, selectedImage.height);
  selectedImage.imageElement.width = canvas.width;
  selectedImage.imageElement.height = canvas.height;
  ctx.drawImage(selectedImage.imageElement, 0, 0, canvas.width, canvas.height);
  const dataURL = canvas.toDataURL();
  worker.postMessage({ type: 'segment', data: dataURL, id: selectedImage.id });
};

const estimateDepth = (image) => {
  if (!dptworker) {
    console.error('model not loaded');
    return;
  }
  image.isEstimatingDepth = true;

  const [canvas, ctx] = createTempCanvas(image.width, image.height);
  image.imageElement.width = canvas.width;
  image.imageElement.height = canvas.height;
  ctx.drawImage(image.imageElement, 0, 0, canvas.width, canvas.height);
  const dataURL = canvas.toDataURL();
  image.id = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

  dptworker.postMessage({ type: 'estimate_depth', data: dataURL, imageId: image.id });
};

const applyDepthMask = (image) => {
  if (!image.depthData) return;
  const { data, width, height } = image.depthData;

  const [depthMaskCanvas, depthMaskCtx] = createTempCanvas(width, height);
  const depthMaskImageData = depthMaskCtx.createImageData(depthMaskCanvas.width, depthMaskCanvas.height);

  const depthValues = Object.values(data);
  const [minDepth, maxDepth] = depthValues.reduce(([min, max], val) => [Math.min(min, val), Math.max(max, val)], [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]);
  
  for (let i = 0; i < depthValues.length; i++) {
    const normalizedDepth = (depthValues[i] - minDepth) / (maxDepth - minDepth);
    depthMaskImageData.data[i * 4] = normalizedDepth * 255;
    depthMaskImageData.data[i * 4 + 1] = normalizedDepth * 255;
    depthMaskImageData.data[i * 4 + 2] = normalizedDepth * 255;
    depthMaskImageData.data[i * 4 + 3] = 255;  // Full alpha
  }
  
  depthMaskCtx.putImageData(depthMaskImageData, 0, 0);
  image.depthMaskCanvas = depthMaskCanvas;
};

const handleInteraction = (x, y, isStart) => {
  if (isStart) {
    isDragging = true;
    lastMouseX = x;
    lastMouseY = y;

    if (isDraggingCropHandle) {
      const dx = x - lastMouseX;
      const dy = y - lastMouseY;
      switch (selectedCropHandle.type) {
        case 'nw':
          selectedImage.cropArea.x += dx;
          selectedImage.cropArea.y += dy;
          selectedImage.cropArea.width -= dx;
          selectedImage.cropArea.height -= dy;
          break;
        case 'ne':
          selectedImage.cropArea.y += dy;
          selectedImage.cropArea.width += dx;
          selectedImage.cropArea.height -= dy;
          break;
        case 'sw':
          selectedImage.cropArea.x += dx;
          selectedImage.cropArea.width -= dx;
          selectedImage.cropArea.height += dy;
          break;
        case 'se':
          selectedImage.cropArea.width += dx;
          selectedImage.cropArea.height += dy;
          break;
        case 'n':
          selectedImage.cropArea.y += dy;
          selectedImage.cropArea.height -= dy;
          break;
        case 's':
          selectedImage.cropArea.height += dy;
          break;
        case 'w':
          selectedImage.cropArea.x += dx;
          selectedImage.cropArea.width -= dx;
          break;
        case 'e':
          selectedImage.cropArea.width += dx;
          break;
      }
      needsRender = true;
    }

    if (selectedImage && isPointInToolbar(x, y, toolbar, selectedImage)) {
      const clickedButton = getClickedButton(x, y, toolbar, selectedImage);
      switch (clickedButton) {
        case 0: // Move back
          const index = scene.indexOf(selectedImage);
          scene.unshift(scene.splice(index, 1)[0]);
          break;
        case 1: // Flip horizontally
          flipImageHorizontally(selectedImage);
          break;
        case 2: // Duplicate
          const dupImage = { ...selectedImage, x: selectedImage.x + 20, y: selectedImage.y + 20 };
          scene.push(dupImage);
          history.push({ type: 'add', image: dupImage });
          selectedImage = dupImage;
          needsRender = true;
          break;
        case 3: // Segment
          segmentImage();
          break;
        case 4: // Download
          const [canvas, ctx] = createTempCanvas(selectedImage.width, selectedImage.height);
          ctx.drawImage(selectedImage.imageElement, 0, 0, canvas.width, canvas.height);
          const dataURL = canvas.toDataURL('image/png');
          const a = document.createElement('a');
          a.href = dataURL;
          a.download = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15) + '.png';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          break;
        case 5: // Delete
          deleteSelectedImage(selectedImage);
          break;
        case 6: // Crop
          isCropping = !isCropping;
          console.log(isCropping);
          if (isCropping) {
            selectedImage.cropArea = {
              x: selectedImage.x - selectedImage.width / 2,
              y: selectedImage.y - selectedImage.height / 2,
              width: selectedImage.width,
              height: selectedImage.height,
            };
          } else cropImage(selectedImage);
          break;
        case 7: // Depth Estimation
          isDepthSliderVisible = !isDepthSliderVisible;
          needsRender = true;
          break;
      }
      needsRender = true;
      return true; // Indicate that we interacted with the toolbar
    }

    const clickedImage = getImageAtPosition(x, y);
    if (clickedImage !== selectedImage) {
      selectedImage = clickedImage;
      if (selectedImage) {
        selectedImage.initialX = selectedImage.x;
        selectedImage.initialY = selectedImage.y;
        selectedImage.initialWidth = selectedImage.width;
        selectedImage.initialHeight = selectedImage.height;
      }
      needsRender = true;
    }

    if (selectedImage) {
      resizeHandle = getResizeHandle(x, y, selectedImage);
      if (resizeHandle) {
        isResizing = true;
        isDragging = false;
      }
    }
  } else {
    if (isDraggingCropHandle) {
      lastMouseX = x;
      lastMouseY = y;
    }

    if (isDragging && selectedImage) {
      const dx = x - lastMouseX;
      const dy = y - lastMouseY;
      selectedImage.x += dx;
      selectedImage.y += dy;
      needsRender = true;
    } else if (isResizing && selectedImage) {
      const dx = x - lastMouseX;
      const dy = y - lastMouseY;
      
      switch (resizeHandle) {
        case 'nw':
          selectedImage.x += dx / 2;
          selectedImage.y += dy / 2;
          selectedImage.width -= dx;
          selectedImage.height -= dy;
          break;
        case 'n':
          selectedImage.y += dy / 2;
          selectedImage.height -= dy;
          break;
        case 'ne':
          selectedImage.x += dx / 2;
          selectedImage.y += dy / 2;
          selectedImage.width += dx;
          selectedImage.height -= dy;
          break;
        case 'e':
          selectedImage.x += dx / 2;
          selectedImage.width += dx;
          break;
        case 'se':
          selectedImage.x += dx / 2;
          selectedImage.y += dy / 2;
          selectedImage.width += dx;
          selectedImage.height += dy;
          break;
        case 's':
          selectedImage.y += dy / 2;
          selectedImage.height += dy;
          break;
        case 'sw':
          selectedImage.x += dx / 2;
          selectedImage.y += dy / 2;
          selectedImage.width -= dx;
          selectedImage.height += dy;
          break;
        case 'w':
          selectedImage.x += dx / 2;
          selectedImage.width -= dx;
          break;
      }
      needsRender = true;
    }

    lastMouseX = x;
    lastMouseY = y;
  }
  return false; // Indicate that we didn't interact with the toolbar
};

const flipImageHorizontally = (image) => {
  image.flipped = !image.flipped;
  const [canvas, ctx] = createTempCanvas(image.width, image.height);
  ctx.scale(-1, 1);
  ctx.drawImage(image.imageElement, -image.width, 0, image.width, image.height);

  const flippedImage = new Image();
  flippedImage.onload = () => {
    image.imageElement = flippedImage;
    needsRender = true;
  };
  flippedImage.src = canvas.toDataURL();
};

const cropImage = (image) => {
  const { cropArea } = image;
  const [croppedCanvas, croppedCtx] = createTempCanvas(cropArea.width, cropArea.height);
  croppedCtx.drawImage(image.imageElement, cropArea.x - image.x + image.width / 2, cropArea.y - image.y + image.height / 2, cropArea.width, cropArea.height, 0, 0, cropArea.width, cropArea.height);

  const croppedImage = new Image();
  croppedImage.onload = () => {
    const croppedImageObject = createImage(renderer, croppedImage, image.x, image.y);
    croppedImageObject.width = cropArea.width;
    croppedImageObject.height = cropArea.height;
    const index = scene.indexOf(image);
    if (index !== -1) scene.splice(index, 1, croppedImageObject);
    history.push({ type: 'delete', image, index });

    selectedImage = croppedImageObject;
    needsRender = true;
  };
  croppedImage.src = croppedCanvas.toDataURL();
};

const getCropHandle = (cropArea) => [
  { x: cropArea.x, y: cropArea.y, type: 'nw' },
  { x: cropArea.x + cropArea.width, y: cropArea.y, type: 'ne' },
  { x: cropArea.x, y: cropArea.y + cropArea.height, type: 'sw' },
  { x: cropArea.x + cropArea.width, y: cropArea.y + cropArea.height, type: 'se' },
  { x: cropArea.x + cropArea.width / 2, y: cropArea.y, type: 'n' },
  { x: cropArea.x + cropArea.width / 2, y: cropArea.y + cropArea.height, type: 's' },
  { x: cropArea.x, y: cropArea.y + cropArea.height / 2, type: 'w' },
  { x: cropArea.x + cropArea.width, y: cropArea.y + cropArea.height / 2, type: 'e' },
];

const onTouchMove = (event) => {
  event.preventDefault();
  if (event.touches.length === 1) {
    const touch = event.touches[0];
    const rect = event.target.getBoundingClientRect();
    mouseX = touch.clientX - rect.left;
    mouseY = touch.clientY - rect.top;
    handleInteraction(mouseX, mouseY, false);
  }
};

const onTouchStart = (event) => {
  event.preventDefault();
  if (event.touches.length === 1) {
    const touch = event.touches[0];
    const rect = event.target.getBoundingClientRect();
    mouseX = touch.clientX - rect.left;
    mouseY = touch.clientY - rect.top;
    if (handleInteraction(mouseX, mouseY, true)) event.preventDefault();
  }
};

const onTouchEnd = (event) => {
  event.preventDefault();
  isDragging = false;
  isResizing = false;
  if (selectedImage && (selectedImage.x !== selectedImage.initialX || selectedImage.y !== selectedImage.initialY ||
      selectedImage.width !== selectedImage.initialWidth || selectedImage.height !== selectedImage.initialHeight)) {
    history.push({ type: 'move_resize', image: selectedImage, fromX: selectedImage.initialX, fromY: selectedImage.initialY, fromWidth: selectedImage.initialWidth, fromHeight: selectedImage.initialHeight });
  }
  document.body.style.cursor = 'default';
};

const getPoint = (x, y, image) => {
  const mouseX = (x - image.x + image.width / 2) / image.width;
  const mouseY = (y - image.y + image.height / 2) / image.height;
  return { point: [mouseX, mouseY], label: 1 };
};

const onMouseMove = (event) => {
  const rect = event.target.getBoundingClientRect();
  mouseX = event.clientX - rect.left;
  mouseY = event.clientY - rect.top;

  if (isDepthSliderVisible && selectedImage && selectedImage.depthData) {
    const sliderX = selectedImage.x - selectedImage.width / 2;
    const sliderY = selectedImage.y + selectedImage.height / 2 + 20;
    const sliderWidth = selectedImage.width;
    const sliderHeight = 20;
    if (isSliderDragging) {
      selectedImage.depthThreshold = Math.max(0, Math.min(1, (mouseX - sliderX) / sliderWidth));
      applyDepthMask(selectedImage);
      needsRender = true;
    } else if (mouseX >= sliderX && mouseX <= sliderX + sliderWidth && mouseY >= sliderY - sliderHeight / 2 && mouseY <= sliderY + sliderHeight / 2) document.body.style.cursor = 'pointer';
  }

  if (isCropping && selectedImage) {
    if (getCropHandle(selectedImage.cropArea).some((handle) => Math.abs(mouseX - handle.x) < handleSize && Math.abs(mouseY - handle.y) < handleSize)) document.body.style.cursor = 'move';
    else document.body.style.cursor = 'default';

    if (isDraggingCropHandle) {
      const dx = mouseX - lastMouseX;
      const dy = mouseY - lastMouseY;
      switch (selectedCropHandle.type) {
        case 'nw':
          selectedImage.cropArea.x += dx;
          selectedImage.cropArea.y += dy;
          selectedImage.cropArea.width -= dx;
          selectedImage.cropArea.height -= dy;
          break;
        case 'ne':
          selectedImage.cropArea.y += dy;
          selectedImage.cropArea.width += dx;
          selectedImage.cropArea.height -= dy;
          break;
        case 'sw':
          selectedImage.cropArea.x += dx;
          selectedImage.cropArea.width -= dx;
          selectedImage.cropArea.height += dy;
          break;
        case 'se':
          selectedImage.cropArea.width += dx;
          selectedImage.cropArea.height += dy;
          break;
        case 'n':
          selectedImage.cropArea.y += dy;
          selectedImage.cropArea.height -= dy;
          break;
        case 's':
          selectedImage.cropArea.height += dy;
          break;
        case 'w':
          selectedImage.cropArea.x += dx;
          selectedImage.cropArea.width -= dx;
          break;
        case 'e':
          selectedImage.cropArea.width += dx;
          break;
      }
      needsRender = true;
    }
  }

  if (isSegmenting && selectedImage && !isDecoding) {
    isDecoding = true;
    const point = getPoint(mouseX, mouseY, selectedImage);
    worker.postMessage({ type: 'decode', data: [point], id: selectedImage.id });
    needsRender = true;
  }

  if (isEmbeddingInProgress) document.body.style.cursor = 'wait';
  else if (selectedImage && isPointInToolbar(mouseX, mouseY, toolbar, selectedImage)) {
    const i = getClickedButton(mouseX, mouseY, toolbar, selectedImage)
    document.body.style.cursor = 'pointer';
    needsRender = true;
  } else if (selectedImage) {
    const handle = getResizeHandle(mouseX, mouseY, selectedImage);
    if (handle) {
      switch (handle) {
        case 'nw':
        case 'se':
          document.body.style.cursor = 'nwse-resize';
          break;
        case 'ne':
        case 'sw':
          document.body.style.cursor = 'nesw-resize';
          break;
        case 'n':
        case 's':
          document.body.style.cursor = 'ns-resize';
          break;
        case 'e':
        case 'w':
          document.body.style.cursor = 'ew-resize';
          break;
      }
    } else if (isDragging) document.body.style.cursor = 'grabbing';
    else if (getImageAtPosition(mouseX, mouseY)) document.body.style.cursor = 'grab';
    else document.body.style.cursor = 'default';
  } else document.body.style.cursor = 'default';

  handleInteraction(mouseX, mouseY, false);
};

const onMouseDown = (event) => {
  const rect = event.target.getBoundingClientRect();
  mouseX = event.clientX - rect.left;
  mouseY = event.clientY - rect.top;

  if (isDepthSliderVisible && selectedImage && selectedImage.depthData) {
    const sliderX = selectedImage.x - selectedImage.width / 2;
    const sliderY = selectedImage.y + selectedImage.height / 2 + 20;
    const sliderWidth = selectedImage.width;
    const sliderHeight = 20;
    if (mouseX >= sliderX && mouseX <= sliderX + sliderWidth && mouseY >= sliderY - sliderHeight / 2 && mouseY <= sliderY + sliderHeight / 2) {
      isSliderDragging = true;
      selectedImage.depthThreshold = Math.max(0, Math.min(1, (mouseX - sliderX) / sliderWidth));
      applyDepthMask(selectedImage);
      needsRender = true;
      event.preventDefault();
      return;
    }
  }

  if (isCropping && selectedImage) {
    if (getCropHandle(selectedImage.cropArea).some((handle) => Math.abs(mouseX - handle.x) < handleSize && Math.abs(mouseY - handle.y) < handleSize)) {
      isDraggingCropHandle = true;
      selectedCropHandle = getCropHandle(selectedImage.cropArea).find((handle) => Math.abs(mouseX - handle.x) < handleSize && Math.abs(mouseY - handle.y) < handleSize);
    }
  }

  if (isSegmenting && selectedImage) {
    const point = getPoint(mouseX, mouseY, selectedImage);
    worker.postMessage({ type: 'decode', data: [point], id: selectedImage.id });
    cutMask();
    isSegmenting = false;
  } else if (handleInteraction(mouseX, mouseY, true)) {
    event.preventDefault();
  }

  if (isDragging) {
    document.body.style.cursor = 'grabbing';
  }
};

const cutMask = () => {
  if (!selectedImage || !currentMask) return;

  const { mask, scores } = currentMask;
  const w = selectedImage.width;
  const h = selectedImage.height;
  const [, imageContext] = createTempCanvas(w, h);
  imageContext.drawImage(selectedImage.imageElement, 0, 0, w, h);
  const imagePixelData = imageContext.getImageData(0, 0, w, h);

  const [cutCanvas, cutContext] = createTempCanvas(w, h);
  const cutPixelData = cutContext.getImageData(0, 0, w, h);

  const numMasks = scores.length;
  let bestIndex = 0;
  for (let i = 1; i < numMasks; ++i) {
    if (scores[i] > scores[bestIndex]) {
      bestIndex = i;
    }
  }

  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask.data[numMasks * i + bestIndex] === 1) {
        for (let j = 0; j < 4; ++j) {
          const offset = 4 * i + j;
          cutPixelData.data[offset] = imagePixelData.data[offset];
        }
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      } else {
        cutPixelData.data[4 * i + 3] = 0;
      }
    }
  }
  cutContext.putImageData(cutPixelData, 0, 0);

  const [finalCanvas, finalContext] = createTempCanvas(maxX - minX + 1, maxY - minY + 1);
  finalContext.drawImage(cutCanvas, minX, minY, finalCanvas.width, finalCanvas.height, 0, 0, finalCanvas.width, finalCanvas.height);

  const cutImage = new Image();
  cutImage.onload = () => {
    const cutObject = createImage(renderer, cutImage, selectedImage.x + selectedImage.width + 20, selectedImage.y);
    scene.push(cutObject);
    needsRender = true;
  };
  cutImage.src = finalCanvas.toDataURL();
  selectedImage.maskCanvas = null;
};

const onMouseUp = () => {
  isDragging = false;
  isResizing = false;
  isDraggingCropHandle = false;
  isSliderDragging = false;
  if (selectedImage && (selectedImage.x !== selectedImage.initialX || selectedImage.y !== selectedImage.initialY ||
      selectedImage.width !== selectedImage.initialWidth || selectedImage.height !== selectedImage.initialHeight)) {
    history.push({ type: 'move_resize', image: selectedImage, fromX: selectedImage.initialX, fromY: selectedImage.initialY, fromWidth: selectedImage.initialWidth, fromHeight: selectedImage.initialHeight });
  }
  document.body.style.cursor = 'default';
};

const onWheel = (event) => {
  event.preventDefault();
  panOffsetX -= event.deltaX;
  panOffsetY -= event.deltaY;
	needsRender = true;
}

const onPaste = (event) => {
  const items = event.clipboardData.items;
  for (const item of items) {
    if (item.type.startsWith('image')) {
      const blob = item.getAsFile();
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const image = createImage(renderer, img, mouseX, mouseY);
          scene.push(image);
          history.push({ type: 'add', image: image });
          needsRender = true;
          estimateDepth(image);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(blob);
      break;
    }
  }
};

const onKeyDown = (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
    if (history.length === 0) return;
    const lastAction = history.pop();
    switch (lastAction.type) {
      case 'add':
        const index = scene.indexOf(lastAction.image);
        if (index !== -1) scene.splice(index, 1);
        break;
      case 'delete':
        scene.splice(lastAction.index, 0, lastAction.image);
        break;
      case 'move_resize':
        lastAction.image.x = lastAction.fromX;
        lastAction.image.y = lastAction.fromY;
        lastAction.image.width = lastAction.fromWidth;
        lastAction.image.height = lastAction.fromHeight;
        break;
    }
    needsRender = true;
  }
	if (selectedImage && (event.key === 'Backspace' || event.key === 'Delete')) deleteSelectedImage(selectedImage);
};

const deleteSelectedImage = (image) => {
  const index = scene.indexOf(image);
  if (index !== -1) {
    history.push({ type: 'delete', image, index });
    scene.splice(index, 1);
    selectedImage = null;
    needsRender = true;
  }
}

const onResize = () => {
  if (resizeRenderer(renderer)) needsRender = true;
};

const render = () => {
  if (needsRender) {
    clearRenderer(renderer);
    scene.forEach((object) => {
			object.x += panOffsetX;
			object.y += panOffsetY;
			renderImage(renderer, object, object === selectedImage, toolbar, isCropping);
      if (isSegmenting && object === selectedImage && object.maskCanvas) renderSegmentMask(renderer, object);
      if (isCropping && object === selectedImage) renderCropOverlay(renderer, object);
      if (object === selectedImage && isDepthSliderVisible) renderDepthSlider(renderer, object, isDepthSliderVisible);
		});
		panOffsetX = 0;
		panOffsetY = 0;
    needsRender = false;
  }
  requestAnimationFrame(render);
};

init();
