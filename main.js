import { createRenderer, resizeRenderer, clearRenderer } from "./renderer";
import { createImage, renderImage } from "./image";

let scene = [];
let history = [];
let renderer;
let mouseX = 0, mouseY = 0;
let needsRender = true;
let selectedImage = null;
let isDragging = false;
let lastMouseX = 0, lastMouseY = 0;

const init = () => {
  const canvas = document.querySelector("#c");
  renderer = createRenderer(canvas);

  // add event listeners
  canvas.addEventListener("mousemove", onMouseMove);
  canvas.addEventListener("mousedown", onMouseDown);
  canvas.addEventListener("mouseup", onMouseUp);
  document.addEventListener("paste", onPaste);
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", onResize);

  onResize();
  render();
}

const getImageAtPosition = (x, y) => {
  for (let i = scene.length - 1; i >= 0; i--) {
    const img = scene[i];
    if (x >= img.x - img.width / 2 && x <= img.x + img.width / 2 && y >= img.y - img.height / 2 && y <= img.y + img.height / 2) {
      return img;
    }
  }
  return null;
}

const onMouseMove = (event) => {
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
}

const onMouseDown = () => {
  isDragging = true;
  lastMouseX = mouseX;
  lastMouseY = mouseY;
  selectedImage = getImageAtPosition(mouseX, mouseY);
}

const onMouseUp = () => {
  isDragging = false;
}

const onPaste = (event) => {
  const items = event.clipboardData.items;
  for (const item of items) {
    if (item.type.indexOf("image") === 0) {
      const blob = item.getAsFile();
      const reader = new FileReader();
      reader.onload = function(e) {
        const img = new Image();
        img.onload = function() {
          const image = createImage(renderer, img, mouseX, mouseY);
          scene.push(image);
          history.push({ type: "add", image: image });
          needsRender = true;
        }
        img.src = e.target.result;
        console.log(e.target.result);
      }
      reader.readAsDataURL(blob);
      break;
    }
  }
}

const onKeyDown = (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "z") {
    if (history.length === 0) return;

    const lastAction = history.pop();
    switch (lastAction.type) {
      case "add":
        const index = scene.indexOf(lastAction.image);
        if (index !== -1) {
          scene.splice(index, 1);
        }
        break;
      case "delete":
        scene.splice(lastAction.index, 0, lastAction.image);
        break;
    }
    needsRender = true;
  }
  if (selectedImage) {
    if (event.key === "Backspace" || event.key === "Delete") {
      const index = scene.indexOf(selectedImage);
      if (index !== -1) {
        history.push({ type: "delete", image: selectedImage, index: index });
        scene.splice(index, 1);
        selectedImage = null;
        needsRender = true;
      }
    }
  }
}

const onResize = () => {
  if (resizeRenderer(renderer)) {
    needsRender = true;
  }
}

const render = () => {
  if (needsRender) {
    clearRenderer(renderer);
    scene.forEach(object => renderImage(renderer, object));
    needsRender = false;
  }
  requestAnimationFrame(render);
}

init();

