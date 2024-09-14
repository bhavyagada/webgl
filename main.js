import { createRenderer, resizeRenderer, clearRenderer, createToolbar, loadToolbarTexture, createImage, renderImage, isPointInToolbar } from './renderer';
import moveBackIcon from './moveback.png';

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

export const init = () => {
  const canvas = document.querySelector("#c");
  const gl = canvas.getContext("webgl2");
  if (!gl) throw new Error("WebGL2 not supported!");
  renderer = createRenderer(canvas, gl);
  toolbar = createToolbar(gl);

  // Load toolbar texture
  loadToolbarTexture(gl, toolbar, moveBackIcon).then(() => {
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
		if (
			x >= img.x - img.width / 2 &&
			x <= img.x + img.width / 2 &&
			y >= img.y - img.height / 2 &&
			y <= img.y + img.height / 2
		) {
			return img;
		}
	}
	return null;
};

const handleDrag = (event) => {
  const rect = event.target.getBoundingClientRect();
  mouseX = event.clientX - rect.left;
  mouseY = event.clientY - rect.top;

  if (isDragging && selectedImage) {
    const dx = mouseX - lastMouseX;
    const dy = mouseY - lastMouseY;
    selectedImage.x += dx;
    selectedImage.y += dy;
    needsRender = true;
  }

  lastMouseX = mouseX;
  lastMouseY = mouseY;
};

const onTouchMove = (event) => {
  event.preventDefault();
  if (event.touches.length === 1) {
    handleDrag(event.touches[0]);
  }
};

const onTouchStart = (event) => {
  event.preventDefault();
  if (event.touches.length === 1) {
    isDragging = true;
    lastMouseX = mouseX;
    lastMouseY = mouseY;
    selectedImage = getImageAtPosition(mouseX, mouseY);
  }
};

const onTouchEnd = (event) => {
  event.preventDefault();
  isDragging = false;
};

const onMouseMove = (event) => handleDrag(event);

const onMouseDown = (event) => {
  isDragging = true;
  lastMouseX = mouseX;
  lastMouseY = mouseY;

  if (selectedImage && isPointInToolbar(mouseX, mouseY, toolbar, selectedImage)) {
    const index = scene.indexOf(selectedImage);
    scene.unshift(scene.splice(index, 1)[0]);
    needsRender = true;
    event.preventDefault();
    return;
  }

  const clickedImage = getImageAtPosition(mouseX, mouseY);
  if (clickedImage !== selectedImage) {
    selectedImage = clickedImage;
    if (selectedImage) {
      selectedImage.initialX = selectedImage.x;
      selectedImage.initialY = selectedImage.y;
    }
    needsRender = true;
  }
};

const onMouseUp = () => {
  if (isDragging && selectedImage && (selectedImage.x !== selectedImage.initialX || selectedImage.y !== selectedImage.initialY)) {
    history.push({
      type: 'move',
      image: selectedImage,
      fromX: selectedImage.initialX,
      fromY: selectedImage.initialY
    });
  }
  isDragging = false;
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
			renderImage(renderer, object, object === selectedImage);
		});
		panOffsetX = 0;
		panOffsetY = 0;
    needsRender = false;
  }
  requestAnimationFrame(render);
};

init();
