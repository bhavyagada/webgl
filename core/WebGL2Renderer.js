export class WebGL2Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext("webgl2");
    if (!this.gl) {
      throw new Error("WebGL2 not supported!");
    }
    this.canvasToDisplaySizeMap = new Map([[this.canvas, [screen.width, screen.height]]]);
    this.resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        let width, height;
        let dpr = window.devicePixelRatio;
        if (entry.devicePixelContentBoxSize) {
          // note: only this path gives the correct answer
          // the other paths are an imperfect fallback for browsers that don't provide anyway to do this
          width = entry.devicePixelContentBoxSize[0].inlineSize;
          height = entry.devicePixelContentBoxSize[0].blockSize;
          dpr = 1; // it's already in width and height
        } else if (entry.contentBoxSize) {
          if (entry.contentBoxSize[0]) {
            width = entry.contentBoxSize[0].inlineSize;
            height = entry.contentBoxSize[0].blockSize;
          } else {
            // legacy
            width = entry.contentBoxSize.inlineSize;
            height = entry.contentBoxSize.blockSize;
          }
        } else {
          // legacy
          width = entry.contentRect.width;
          height = entry.contentRect.height;
        }
        const displayWidth = Math.round(width * dpr);
        const displayHeight = Math.round(height * dpr);
        this.canvasToDisplaySizeMap.set(entry.target, [displayWidth, displayHeight]);
      }
    });
    this.resizeObserver.observe(this.canvas, { box: "content-box" });
  }

  resizeCanvasToDisplaySize(canvas) {
    // lookup the size the browser is displaying the canvas in CSS pixels
    const [displayWidth, displayHeight] = this.canvasToDisplaySizeMap.get(canvas);
    // check if canvas is not the same size
    const needResize = canvas.width !== displayWidth || canvas.height !== displayHeight;
    if (needResize) {
      // make the canvas the same size
      this.canvas.width = displayWidth;
      this.canvas.height = displayHeight;
      this.gl.viewport(0, 0, displayWidth, displayHeight);
    }

    return needResize;
  }

  clear() {
    this.gl.clearColor(0.3, 0.3, 0.3, 1.0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
  }

  render(scene) {
    this.clear();
    scene.objects.forEach(object => object.render(this));
  }
}

