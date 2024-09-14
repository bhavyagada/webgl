import { createRenderer, resizeRenderer, clearRenderer, createToolbar, loadToolbarTexture, createImage, renderImage, isPointInToolbar, getClickedButton } from './renderer';
import backIcon from './icons/moveback.png';
import flipIcon from './icons/flip.png';
import duplicateIcon from './icons/duplicate.png';

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

export const init = () => {
  const canvas = document.querySelector("#c");
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("WebGL2 not supported!");
  renderer = createRenderer(canvas, gl);
  toolbar = createToolbar(gl);

  // Load toolbar texture
  loadToolbarTexture(gl, [backIcon, flipIcon, duplicateIcon]).then((textures) => {
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
    if (x >= img.x - img.width / 2 && x <= img.x + img.width / 2 &&
      y >= img.y - img.height / 2 && y <= img.y + img.height / 2) {
      return img;
    }
  }
  return null;
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
          const dupImage = { ...selectedImage };
          dupImage.x += 20;
          dupImage.y += 20;
          selectedImage = dupImage;
          scene.push(dupImage);
          history.push({ type: 'add', image: dupImage });
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
    history.push({
      type: 'move',
      image: selectedImage,
      fromX: selectedImage.initialX,
      fromY: selectedImage.initialY
    });
  }
};

const onMouseMove = (event) => {
  const rect = event.target.getBoundingClientRect();
  mouseX = event.clientX - rect.left;
  mouseY = event.clientY - rect.top;
  handleInteraction(mouseX, mouseY, false);
};

const onMouseDown = (event) => {
  const rect = event.target.getBoundingClientRect();
  mouseX = event.clientX - rect.left;
  mouseY = event.clientY - rect.top;
  if (handleInteraction(mouseX, mouseY, true)) {
    event.preventDefault();
  }
};

const onMouseUp = () => {
  isDragging = false;
  if (selectedImage && (selectedImage.x !== selectedImage.initialX || selectedImage.y !== selectedImage.initialY)) {
    history.push({
      type: 'move',
      image: selectedImage,
      fromX: selectedImage.initialX,
      fromY: selectedImage.initialY
    });
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
        img.onload = function () {
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
		});
		panOffsetX = 0;
		panOffsetY = 0;
    needsRender = false;
  }
  requestAnimationFrame(render);
};

init();
