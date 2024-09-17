import { createRenderer, resizeRenderer, clearRenderer, loadToolbarTexture, renderMask, createImage, renderImage, isPointInToolbar, getClickedButton } from './renderer';
import backIcon from './icons/moveback.svg';
import flipIcon from './icons/flip.png';
import duplicateIcon from './icons/duplicate.png';
import segmentIcon from './icons/segment.png';

let scene = [];
let history = [];
let renderer;
let mouseX = 0;
let mouseY = 0;
let needsRender = true;
let selectedImage = null;
let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;
let panOffsetX = 0;
let panOffsetY = 0;
let toolbar;

// SAM State variables
let worker = new Worker('worker.js', { type: 'module' });
let isSegmenting = false;
let currentMask = null;
let isDecoding = false;

export const init = () => {
  const canvas = document.querySelector("#c");
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("WebGL2 not supported!");
  renderer = createRenderer(canvas, gl);
  toolbar = { buttonWidth: 35, buttonHeight: 35, gap: 15, buttonTextures: [] };

  // Load toolbar texture
  loadToolbarTexture(gl, [backIcon, flipIcon, duplicateIcon, segmentIcon]).then((textures) => {
    toolbar.buttonTextures = textures;
    needsRender = true;
  });

  // add event listeners
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

  // loadImage('https://valorvinyls.com/cdn/shop/files/StayHardGoggins.jpg?v=1707978088');
  loadImage('https://www.jockostore.com/cdn/shop/t/33/assets/popup-image.jpg?v=142777728587095439201637241641');

  onResize();
  render();

  loadSegmentationModel();
};

const loadImage = (url) => {
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
	xhr.open('GET', url);
  xhr.responseType = 'blob';
  xhr.send();
};

const getImageAtPosition = (x, y) => {
  for (let i = scene.length - 1; i >= 0; i--) {
    const img = scene[i];
    if (x >= img.x - img.width / 2 && x <= img.x + img.width / 2 && y >= img.y - img.height / 2 && y <= img.y + img.height / 2) {
      return img;
    }
  }
  return null;
};

const loadSegmentationModel = async () => {
  worker.onmessage = (e) => {
    const { type, data } = e.data;
    if (type === 'ready') {
      console.log('model loaded successfully');
    } else if (type === 'segment_result') {
      if (data === 'start') {
        console.log('Extracting image embedding...');
      } else {
        console.log('Embedding extracted!');
        // isSegmenting = true;
        needsRender = true;
      }
    } else if (type === 'decode_result') {
      handleDecodeResult(data);
    }
  };
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
  // isSegmenting = true;

  // Convert image to data URL
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image.imageElement, 0, 0);
  const dataURL = canvas.toDataURL();

  // Send the image to the worker for processing
  worker.postMessage({ type: 'segment', data: dataURL });
};

const handleInteraction = (x, y, isStart) => {
  if (isStart) {
    isDragging = true;
    lastMouseX = x;
    lastMouseY = y;

    if (selectedImage && isPointInToolbar(x, y, toolbar, selectedImage, 3)) {
      const clickedButton = getClickedButton(x, y, toolbar, selectedImage, 3);
      switch (clickedButton) {
        case 0: // Move back
          console.log("move back button clicked!!");
          const index = scene.indexOf(selectedImage);
          scene.unshift(scene.splice(index, 1)[0]);
          break;
        case 1: // Flip horizontally
          console.log("flip button clicked!!");
          selectedImage.flipped = !selectedImage.flipped;
          needsRender = true;
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
          // segmentImage(selectedImage);
          isSegmenting = true;
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
      }
      needsRender = true;
    }
  } else {
    if (isDragging && selectedImage) {
      const dx = x - lastMouseX;
      const dy = y - lastMouseY;
      selectedImage.x += dx;
      selectedImage.y += dy;
      needsRender = true;
    }

    lastMouseX = x;
    lastMouseY = y;
  }
  return false; // Indicate that we didn't interact with the toolbar
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
  if (selectedImage && (selectedImage.x !== selectedImage.initialX || selectedImage.y !== selectedImage.initialY)) {
    history.push({ type: 'move', image: selectedImage, fromX: selectedImage.initialX, fromY: selectedImage.initialY });
  }
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

  if (isSegmenting && selectedImage && !isDecoding) {
    isDecoding = true;
    const point = getPoint(mouseX, mouseY, selectedImage);
    worker.postMessage({ type: 'decode', data: [point] });
    needsRender = true;
  }

  if (selectedImage && isPointInToolbar(mouseX, mouseY, toolbar, selectedImage)) {
    const i = getClickedButton(mouseX, mouseY, toolbar, selectedImage)
    console.log(i);
    needsRender = true;
  }
  handleInteraction(mouseX, mouseY, false);
};

const onMouseDown = (event) => {
  const rect = event.target.getBoundingClientRect();
  mouseX = event.clientX - rect.left;
  mouseY = event.clientY - rect.top;
  if (isSegmenting && selectedImage) {
    const point = getPoint(mouseX, mouseY, selectedImage);
    worker.postMessage({ type: 'decode', data: [point] });
    cutMask();
    isSegmenting = false;
  } else if (handleInteraction(mouseX, mouseY, true)) {
    event.preventDefault();
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
  if (selectedImage && (selectedImage.x !== selectedImage.initialX || selectedImage.y !== selectedImage.initialY)) {
    history.push({ type: 'move', image: selectedImage, fromX: selectedImage.initialX, fromY: selectedImage.initialY });
  }
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
          segmentImage(image);
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
      case 'move':
        lastAction.image.x = lastAction.fromX;
        lastAction.image.y = lastAction.fromY;
        break;
    }
    needsRender = true;
  }
	if (selectedImage && (event.key === 'Backspace' || event.key === 'Delete')) {
    const index = scene.indexOf(selectedImage);
    if (index !== -1) {
      history.push({ type: 'delete', image: selectedImage, index: index });
      scene.splice(index, 1);
      selectedImage = null;
      needsRender = true;
    }
  }
};

const onResize = () => {
  if (resizeRenderer(renderer)) needsRender = true
};

const render = () => {
  if (needsRender) {
    clearRenderer(renderer);
    scene.forEach((object) => {
			object.x += panOffsetX;
			object.y += panOffsetY;
			renderImage(renderer, object, object === selectedImage, toolbar);

      // Render mask if segmenting and this is the selected image
      if (isSegmenting && object === selectedImage && object.maskCanvas) {
        renderMask(renderer, object);
      }
		});
		panOffsetX = 0;
		panOffsetY = 0;
    needsRender = false;
  }
  requestAnimationFrame(render);
};

init();
