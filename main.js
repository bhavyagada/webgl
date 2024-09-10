import { WebGL2Renderer } from "./core/WebGL2Renderer";
import { ImageObj } from "./objects/Image";

let scene = [];
let renderer;
let mouseX = 0, mouseY = 0;
let needsRender = true;
let selectedImage = null;
let isDragging = false;
let lastMouseX = 0, lastMouseY = 0;

const init = () => {
  const canvas = document.querySelector("#c");
  renderer = new WebGL2Renderer(canvas);

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
  selectedImage = null;
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
          const image = new ImageObj(img, mouseX, mouseY);
          image.init(renderer);
          scene.push(image);
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
    scene.pop();
    needsRender = true;
  }
}

const onResize = () => {
  if (renderer.resizeCanvasToDisplaySize(renderer.canvas)) {
    needsRender = true;
  }
}

const render = () => {
  if (needsRender) {
    renderer.render(scene);
    needsRender = false;
  }
  requestAnimationFrame(render);
}

init();

