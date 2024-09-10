import { WebGL2Renderer } from "./core/WebGL2Renderer";
import { Scene } from "./core/Scene";
import { ImageObj } from "./objects/Image";

let renderer, scene;
let mouseX = 0, mouseY = 0;
let needsRender = true;

const init = () => {
  const canvas = document.querySelector("#c");
  renderer = new WebGL2Renderer(canvas);
  scene = new Scene();

  // add event listeners
  canvas.addEventListener("mousemove", onMouseMove);
  document.addEventListener("paste", onPaste);
  window.addEventListener("resize", onResize);

  onResize();
  render();
}

const onMouseMove = (event) => {
  const rect = event.target.getBoundingClientRect();
  mouseX = event.clientX - rect.left;
  mouseY = event.clientY - rect.top;
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
          scene.add(image);
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

