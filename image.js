import { createShader, createProgram } from "./utils.js";
import { imageVertexShader, imageFragmentShader } from "./shaders.js";

export const createImage = (renderer, imageElement, x, y) => {
  const image = {
    image: imageElement,
    x,
    y,
    width: imageElement.width,
    height: imageElement.height,
    program: null,
    vao: null,
    positionBuffer: null,
    texture: null,
    initialized: false
  };

  initImage(renderer, image);
  return image;
}

export const initImage = (renderer, image) => {
  const { gl } = renderer;

  const vertexShader = createShader(gl, gl.VERTEX_SHADER, imageVertexShader);
  const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, imageFragmentShader);
  image.program = createProgram(gl, vertexShader, fragmentShader);

  if (!image.program) {
    console.error("Failed to create shader program");
    return;
  }

  image.positionAttributeLocation = gl.getAttribLocation(image.program, "a_position");
  image.texCoordAttributeLocation = gl.getAttribLocation(image.program, "a_texCoord");
  image.resolutionUniformLocation = gl.getUniformLocation(image.program, "u_resolution");
  image.imageUniformLocation = gl.getUniformLocation(image.program, "u_image");
  image.translationUniformLocation = gl.getUniformLocation(image.program, "u_translation");

  image.vao = gl.createVertexArray();
  gl.bindVertexArray(image.vao);

  image.positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, image.positionBuffer);
  gl.enableVertexAttribArray(image.positionAttributeLocation);
  gl.vertexAttribPointer(image.positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

  const texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    0.0, 0.0,
    1.0, 0.0,
    0.0, 1.0,
    0.0, 1.0,
    1.0, 0.0,
    1.0, 1.0,
  ]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(image.texCoordAttributeLocation);
  gl.vertexAttribPointer(image.texCoordAttributeLocation, 2, gl.FLOAT, false, 0, 0);

  image.texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, image.texture);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image.image);

  gl.bindVertexArray(null);

  image.initialized = true;
}

export const renderImage = (renderer, image) => {
  if (!image.initialized) {
    console.warn("Attempting to render uninitialized image");
    return;
  }

  const { gl } = renderer;
  gl.useProgram(image.program);
  gl.bindVertexArray(image.vao);

  gl.uniform2f(image.resolutionUniformLocation, gl.canvas.width, gl.canvas.height);

  gl.activeTexture(gl.TEXTURE0 + 0);
  gl.bindTexture(gl.TEXTURE_2D, image.texture);
  gl.uniform1i(image.imageUniformLocation, 0);

  const centerX = image.x - image.width / 2;
  const centerY = gl.canvas.height - image.y - image.height / 2;
  gl.uniform2f(image.translationUniformLocation, centerX, centerY);

  gl.bindBuffer(gl.ARRAY_BUFFER, image.positionBuffer);
  let halfWidth = image.width / 2;
  let halfHeight = image.height / 2;
  let x1 = image.x - halfWidth;
  let x2 = image.x + halfWidth;
  let y1 = image.y - halfHeight;
  let y2 = image.y + halfHeight;
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    x1, y1,
    x2, y1,
    x1, y2,
    x1, y2,
    x2, y1,
    x2, y2,
  ]), gl.STATIC_DRAW);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  gl.bindVertexArray(null);
}

