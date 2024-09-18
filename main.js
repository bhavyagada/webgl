import { createRenderer, resizeRenderer, clearRenderer, loadToolbarTexture, renderMask, createImage, renderImage, isPointInToolbar, getClickedButton, renderCropOverlay } from './renderer';
import backIcon from './icons/moveback.svg';
import flipIcon from './icons/flip.svg';
import duplicateIcon from './icons/duplicate.svg';
import segmentIcon from './icons/segment.svg';
import downloadIcon from './icons/download.svg';
import deleteIcon from './icons/delete.svg';
import cropIcon from './icons/crop.svg';

const worker = new Worker('worker.js', { type: 'module' });
const toolbar = { buttonWidth: 30, buttonHeight: 30, gap: 15, buttonTextures: [] };
const canvas = document.querySelector("#c");
const gl = canvas.getContext("webgl2");
if (!gl) throw new Error("WebGL2 not supported!");
const renderer = createRenderer(canvas, gl);

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

worker.onmessage = (e) => {
  const { type, data } = e.data;
  if (type === 'ready') {
    console.log('model loaded!');
  } else if (type === 'segment_result') {
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
  } else if (type === 'decode_result') {
    handleDecodeResult(data);
  }
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
			};
			img.src = reader.result;
		};
    reader.readAsDataURL(xhr.response);
  };
	xhr.open('GET', 'https://www.jockostore.com/cdn/shop/t/33/assets/popup-image.jpg?v=142777728587095439201637241641');
  xhr.responseType = 'blob';
  xhr.send();

  loadToolbarTexture(gl, [backIcon, flipIcon, duplicateIcon, segmentIcon, downloadIcon, deleteIcon, cropIcon]).then((textures) => {
    toolbar.buttonTextures = textures;
    needsRender = true;
  });

  onResize();
  render();
};

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

  // Create a new canvas to draw the mask
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = selectedImage.width;
  maskCanvas.height = selectedImage.height;
  const ctx = maskCanvas.getContext('2d');

  // Create context and allocate buffer for pixel data
  const imageData = ctx.createImageData(maskCanvas.width, maskCanvas.height);

  // Select best mask
  const numMasks = scores.length;
  let bestIndex = 0;
  for (let i = 1; i < numMasks; ++i) {
    if (scores[i] > scores[bestIndex]) {
      bestIndex = i;
    }
  }

  // Fill mask with colour
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

  // Draw image data to context
  ctx.putImageData(imageData, 0, 0);

  // Update the mask on the selectedImage
  selectedImage.maskCanvas = maskCanvas;
  needsRender = true;
  isDecoding = false;
};

const segmentImage = async (image) => {
  if (!worker) {
    console.error('model not loaded');
    return;
  }
  isSegmenting = true;

  // Convert image to data URL
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  image.imageElement.width = canvas.width;
  image.imageElement.height = canvas.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image.imageElement, 0, 0, canvas.width, canvas.height);
  const dataURL = canvas.toDataURL();

  // Send the image to the worker for processing
  worker.postMessage({ type: 'segment', data: dataURL });
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
          console.log("move back button clicked!!");
          const index = scene.indexOf(selectedImage);
          scene.unshift(scene.splice(index, 1)[0]);
          break;
        case 1: // Flip horizontally
          console.log("flip button clicked!!");
          flipImageHorizontally(selectedImage);
          break;
        case 2: // Duplicate
          console.log("duplicate button clicked!!");
          const dupImage = { ...selectedImage, x: selectedImage.x + 20, y: selectedImage.y + 20 };
          scene.push(dupImage);
          history.push({ type: 'add', image: dupImage });
          selectedImage = dupImage;
          needsRender = true;
          break;
        case 3: // Segment
          console.log("segmentation button clicked!");
          segmentImage(selectedImage);
          break;
        case 4: // Download
          console.log("download button clicked");
          const canvas = document.createElement('canvas');
          canvas.width = selectedImage.width;
          canvas.height = selectedImage.height;
          const ctx = canvas.getContext('2d');
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
          console.log("delete button clicked");
          deleteSelectedImage(selectedImage);
          break;
        case 6: // Crop
          console.log("crop button clicked");
          isCropping = !isCropping;
          console.log(isCropping);
          if (isCropping) {
            // Initialize crop area to the current image size
            selectedImage.cropArea = {
              x: selectedImage.x - selectedImage.width / 2,
              y: selectedImage.y - selectedImage.height / 2,
              width: selectedImage.width,
              height: selectedImage.height,
            };
          } else {
            // Crop the image and discard the image outside the crop area
            cropImage(selectedImage);
          }
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
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');

  // Draw the image flipped
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
  const croppedCanvas = document.createElement('canvas');
  croppedCanvas.width = cropArea.width;
  croppedCanvas.height = cropArea.height;
  const croppedCtx = croppedCanvas.getContext('2d');

  croppedCtx.drawImage(image.imageElement, cropArea.x - image.x + image.width / 2, cropArea.y - image.y + image.height / 2, cropArea.width, cropArea.height, 0, 0, cropArea.width, cropArea.height);

  const croppedImage = new Image();
  croppedImage.onload = () => {
    // Create a new image object for the cropped image
    const croppedImageObject = createImage(renderer, croppedImage, image.x, image.y);
    croppedImageObject.width = cropArea.width;
    croppedImageObject.height = cropArea.height;

    // Replace the original image in the scene array with the new cropped image object
    const index = scene.indexOf(image);
    if (index !== -1) {
      scene.splice(index, 1, croppedImageObject);
    }
    history.push({ type: 'delete', image, index });

    // Update the selectedImage to reference the new cropped image object
    selectedImage = croppedImageObject;
    needsRender = true;
  };
  croppedImage.src = croppedCanvas.toDataURL();
};

// Add a new function to check if the mouse is over a crop handle
const isOverCropHandle = (x, y, image) => {
  const { cropArea } = image;
  const handleSize = 10;
  const handles = [
    { x: cropArea.x, y: cropArea.y },
    { x: cropArea.x + cropArea.width, y: cropArea.y },
    { x: cropArea.x, y: cropArea.y + cropArea.height },
    { x: cropArea.x + cropArea.width, y: cropArea.y + cropArea.height },
    { x: cropArea.x + cropArea.width / 2, y: cropArea.y },
    { x: cropArea.x + cropArea.width / 2, y: cropArea.y + cropArea.height },
    { x: cropArea.x, y: cropArea.y + cropArea.height / 2 },
    { x: cropArea.x + cropArea.width, y: cropArea.y + cropArea.height / 2 },
  ];
  return handles.some((handle) => Math.abs(x - handle.x) < handleSize && Math.abs(y - handle.y) < handleSize);
};

const getSelectedCropHandle = (x, y, image) => {
  const { cropArea } = image;
  const handleSize = 10;
  const handles = [
    { x: cropArea.x, y: cropArea.y, type: 'nw' },
    { x: cropArea.x + cropArea.width, y: cropArea.y, type: 'ne' },
    { x: cropArea.x, y: cropArea.y + cropArea.height, type: 'sw' },
    { x: cropArea.x + cropArea.width, y: cropArea.y + cropArea.height, type: 'se' },
    { x: cropArea.x + cropArea.width / 2, y: cropArea.y, type: 'n' },
    { x: cropArea.x + cropArea.width / 2, y: cropArea.y + cropArea.height, type: 's' },
    { x: cropArea.x, y: cropArea.y + cropArea.height / 2, type: 'w' },
    { x: cropArea.x + cropArea.width, y: cropArea.y + cropArea.height / 2, type: 'e' },
  ];
  return handles.find(
    (handle) =>
      Math.abs(x - handle.x) < handleSize && Math.abs(y - handle.y) < handleSize
  );
};

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
    if (handleInteraction(mouseX, mouseY, true)) {
      event.preventDefault();
    }
  }
};

const onTouchEnd = (event) => {
  event.preventDefault();
  isDragging = false;
  isResizing = false;
  if (selectedImage && (selectedImage.x !== selectedImage.initialX || selectedImage.y !== selectedImage.initialY ||
      selectedImage.width !== selectedImage.initialWidth || selectedImage.height !== selectedImage.initialHeight)) {
    history.push({ 
      type: 'move_resize', 
      image: selectedImage, 
      fromX: selectedImage.initialX, 
      fromY: selectedImage.initialY,
      fromWidth: selectedImage.initialWidth,
      fromHeight: selectedImage.initialHeight
    });
  }
  document.body.style.cursor = 'default';
};

const getPoint = (x, y, image) => {
  const mouseX = (x - image.x + image.width / 2) / image.width;
  const mouseY = (y - image.y + image.height / 2) / image.height;
  return {
    point: [mouseX, mouseY],
    label: 1,
  };
};

const onMouseMove = (event) => {
  const rect = event.target.getBoundingClientRect();
  mouseX = event.clientX - rect.left;
  mouseY = event.clientY - rect.top;

  if (isCropping && selectedImage) {
    if (isOverCropHandle(mouseX, mouseY, selectedImage)) {
      document.body.style.cursor = 'move';
    } else {
      document.body.style.cursor = 'default';
    }

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
    worker.postMessage({ type: 'decode', data: [point] });
    needsRender = true;
  }

  if (isEmbeddingInProgress) {
    document.body.style.cursor = 'wait';
  } else if (selectedImage && isPointInToolbar(mouseX, mouseY, toolbar, selectedImage)) {
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
    } else if (isDragging) {
      document.body.style.cursor = 'grabbing';
    } else if (getImageAtPosition(mouseX, mouseY)) {
      document.body.style.cursor = 'grab';
    } else {
      document.body.style.cursor = 'default';
    }
  } else {
    document.body.style.cursor = 'default';
  }

  handleInteraction(mouseX, mouseY, false);
};

const onMouseDown = (event) => {
  const rect = event.target.getBoundingClientRect();
  mouseX = event.clientX - rect.left;
  mouseY = event.clientY - rect.top;

  if (isCropping && selectedImage) {
    if (isOverCropHandle(mouseX, mouseY, selectedImage)) {
      isDraggingCropHandle = true;
      selectedCropHandle = getSelectedCropHandle(mouseX, mouseY, selectedImage);
    }
  }

  if (isSegmenting && selectedImage) {
    const point = getPoint(mouseX, mouseY, selectedImage);
    worker.postMessage({ type: 'decode', data: [point] });
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

  // Create a new canvas to hold the image
  const imageCanvas = document.createElement('canvas');
  imageCanvas.width = w;
  imageCanvas.height = h;
  const imageContext = imageCanvas.getContext('2d');
  imageContext.drawImage(selectedImage.imageElement, 0, 0, w, h);
  const imagePixelData = imageContext.getImageData(0, 0, w, h);

  // Create a new canvas to hold the cut-out
  const cutCanvas = document.createElement('canvas');
  cutCanvas.width = w;
  cutCanvas.height = h;
  const cutContext = cutCanvas.getContext('2d');
  const cutPixelData = cutContext.getImageData(0, 0, w, h);

  // Select best mask
  const numMasks = scores.length;
  let bestIndex = 0;
  for (let i = 1; i < numMasks; ++i) {
    if (scores[i] > scores[bestIndex]) {
      bestIndex = i;
    }
  }

  // Find the bounding box of the non-transparent pixels
  let minX = w, minY = h, maxX = 0, maxY = 0;

  // Copy the image pixel data to the cut canvas only where the mask is active
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (mask.data[numMasks * i + bestIndex] === 1) {
        for (let j = 0; j < 4; ++j) {
          const offset = 4 * i + j;
          cutPixelData.data[offset] = imagePixelData.data[offset];
        }
        // Update bounding box
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      } else {
        // Set alpha to 0 for non-masked areas
        cutPixelData.data[4 * i + 3] = 0;
      }
    }
  }

  cutContext.putImageData(cutPixelData, 0, 0);

  // Create a new canvas with the size of the bounding box
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = maxX - minX + 1;
  finalCanvas.height = maxY - minY + 1;
  const finalContext = finalCanvas.getContext('2d');

  // Draw the cut-out image to the final canvas
  finalContext.drawImage(cutCanvas, minX, minY, finalCanvas.width, finalCanvas.height, 0, 0, finalCanvas.width, finalCanvas.height);

  // Create a new image from the cut-out
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
  if (selectedImage && (selectedImage.x !== selectedImage.initialX || selectedImage.y !== selectedImage.initialY ||
      selectedImage.width !== selectedImage.initialWidth || selectedImage.height !== selectedImage.initialHeight)) {
    history.push({ 
      type: 'move_resize', 
      image: selectedImage, 
      fromX: selectedImage.initialX, 
      fromY: selectedImage.initialY,
      fromWidth: selectedImage.initialWidth,
      fromHeight: selectedImage.initialHeight
    });
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
        };
        img.src = e.target.result;
        console.log(e.target.result);
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
	if (selectedImage && (event.key === 'Backspace' || event.key === 'Delete')) {
    deleteSelectedImage(selectedImage);
  }
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
  if (resizeRenderer(renderer)) needsRender = true
};

const render = () => {
  if (needsRender) {
    clearRenderer(renderer);
    scene.forEach((object) => {
			object.x += panOffsetX;
			object.y += panOffsetY;
			renderImage(renderer, object, object === selectedImage, toolbar, isCropping);

      // Render mask if segmenting and this is the selected image
      if (isSegmenting && object === selectedImage && object.maskCanvas) {
        renderMask(renderer, object);
      }

      // Render crop overlay and handles if cropping and this is the selected image
      if (isCropping && object === selectedImage) {
        renderCropOverlay(renderer, object);
      }
		});
		panOffsetX = 0;
		panOffsetY = 0;
    needsRender = false;
  }
  requestAnimationFrame(render);
};

init();
