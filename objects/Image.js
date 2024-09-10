import { createShader, createProgram } from "../utils";
import { imageVertexShader, imageFragmentShader } from "../shaders";

export class ImageObj {
  constructor(imageElement, x, y) {
    this.image = imageElement;
    this.x = x;
    this.y = y;
    this.width = imageElement.width;
    this.height = imageElement.height;
    this.program = null;
    this.vao = null;
    this.positionBuffer = null;
    this.texture = null;
  }

  init(renderer) {
    const { gl } = renderer;

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, imageVertexShader);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, imageFragmentShader);
    this.program = createProgram(gl, vertexShader, fragmentShader);

    this.positionAttributeLocation = gl.getAttribLocation(this.program, "a_position");
    this.texCoordAttributeLocation = gl.getAttribLocation(this.program, "a_texCoord");
    this.resolutionUniformLocation = gl.getUniformLocation(this.program, "u_resolution");
    this.imageUniformLocation = gl.getUniformLocation(this.program, "u_image");
    this.translationUniformLocation = gl.getUniformLocation(this.program, "u_translation");

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    this.positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    gl.enableVertexAttribArray(this.positionAttributeLocation);
    gl.vertexAttribPointer(this.positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

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
    gl.enableVertexAttribArray(this.texCoordAttributeLocation);
    gl.vertexAttribPointer(this.texCoordAttributeLocation, 2, gl.FLOAT, false, 0, 0);

    this.texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.texture);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.image);

    gl.bindVertexArray(null);
  }

  render(renderer) {
    const { gl } = renderer;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    gl.uniform2f(this.resolutionUniformLocation, gl.canvas.width, gl.canvas.height);

    gl.activeTexture(gl.TEXTURE0 + 0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.uniform1i(this.imageUniformLocation, 0);

    const centerX = this.x - this.width / 2;
    const centerY = gl.canvas.height - this.y - this.height / 2;
    gl.uniform2f(this.translationUniformLocation, centerX, centerY);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
    let halfWidth = this.width / 2;
    let halfHeight = this.height / 2;
    let x1 = this.x - halfWidth;
    let x2 = this.x + halfWidth;
    let y1 = this.y - halfHeight;
    let y2 = this.y + halfHeight;
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
}

