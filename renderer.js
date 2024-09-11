export const createRenderer = (canvas) => {
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    throw new Error("WebGL2 not supported!");
  }
  return { gl, canvas };
}

export const resizeRenderer = (renderer, multiplier = 1) => {
  const { canvas, gl } = renderer;
  const width = canvas.clientWidth * multiplier | 0;
  const height = canvas.clientHeight * multiplier | 0;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    return true;
  }
  return false;
}

export const clearRenderer = (renderer) => {
  const { gl } = renderer;
  gl.clearColor(0.3, 0.3, 0.3, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

