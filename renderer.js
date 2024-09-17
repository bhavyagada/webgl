import { imageVertexShader, imageFragmentShader } from "./shaders";
import { createProgramFromShaders } from "./utils";

export const createRenderer = (canvas, gl) => {
  const program = createProgramFromShaders(gl, imageVertexShader, imageFragmentShader);

  const positionAttribLocation = gl.getAttribLocation(program, "a_position");
  const texCoordAttribLocation = gl.getAttribLocation(program, "a_texCoord");

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    -1, -1, 1, -1, -1, 1,
    -1, 1, 1, -1, 1, 1
  ]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(positionAttribLocation, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(positionAttribLocation);

  const texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    0, 0, 1, 0, 0, 1,
    0, 1, 1, 0, 1, 1
  ]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(texCoordAttribLocation, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(texCoordAttribLocation);

  gl.bindVertexArray(null);

  return {
    canvas,
    gl,
    program,
    uniforms: {
      resolution: gl.getUniformLocation(program, 'u_resolution'),
      position: gl.getUniformLocation(program, 'u_position'),
      size: gl.getUniformLocation(program, 'u_size'),
      isImage: gl.getUniformLocation(program, 'is_image'),
      image: gl.getUniformLocation(program, 'u_image'),
      color: gl.getUniformLocation(program, 'u_color'),
      flipX: gl.getUniformLocation(program, 'u_flipX'),
    },
    vao,
    positionBuffer,
    texCoordBuffer
  };
};

export const resizeRenderer = (renderer) => {
	const { canvas, gl } = renderer;
	const width = Math.floor(canvas.clientWidth);
	const height = Math.floor(canvas.clientHeight);
	const needResize = canvas.width !== width || canvas.height !== height;
	if (needResize) {
		canvas.width = width;
		canvas.height = height;
		gl.viewport(0, 0, canvas.width, canvas.height);
	}
	return needResize;
};

export const clearRenderer = (renderer) => {
  const { gl } = renderer;
  gl.clearColor(0.2, 0.2, 0.2, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
};

export const loadToolbarTexture = (gl, imageSources) => Promise.all(imageSources.map(src => {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
      gl.generateMipmap(gl.TEXTURE_2D);
      resolve(texture);
    };
    image.src = src;
  });
}));

export const renderToolbar = (gl, uniforms, toolbar, image) => {
  const toolbarY = image.y - image.height / 2 - toolbar.buttonHeight - toolbar.gap;
  
  toolbar.buttonTextures.forEach((texture, index) => {
    const toolbarX = image.x - (toolbar.buttonTextures.length * toolbar.buttonWidth) / 2 + index * toolbar.buttonWidth;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.image, 0);
    gl.uniform1i(uniforms.isImage, 1);
    gl.uniform2f(uniforms.position, toolbarX + toolbar.buttonWidth / 2, toolbarY + toolbar.buttonHeight / 2);
    gl.uniform2f(uniforms.size, toolbar.buttonWidth / 2, toolbar.buttonHeight / 2);
    gl.uniform1i(uniforms.flipX, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  });
};

export const renderMask = (renderer, image) => {
  const { gl, program, vao, uniforms } = renderer;

  gl.useProgram(program);
  gl.uniform2f(uniforms.resolution, gl.canvas.width, gl.canvas.height);
  gl.bindVertexArray(vao);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // Create a texture from the mask canvas
  const maskTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, maskTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image.maskCanvas);

  // Render the mask
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, maskTexture);
  gl.uniform1i(uniforms.image, 0);
  gl.uniform1i(uniforms.isImage, 1);
  gl.uniform2f(uniforms.position, image.x, image.y);
  gl.uniform2f(uniforms.size, image.width / 2, image.height / 2);
  gl.uniform1i(uniforms.flipX, image.flipped ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);
};

export const createImage = (renderer, imageElement, x, y) => {
  const { gl } = renderer;
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageElement);

  return {
    imageElement,
    texture,
    x,
    y,
    width: imageElement.width,
    height: imageElement.height,
    flipped: false
  };
};

export const renderImage = (renderer, image, isSelected, toolbar) => {
  const { gl, program, vao, uniforms } = renderer;

  gl.useProgram(program);
  gl.uniform2f(uniforms.resolution, gl.canvas.width, gl.canvas.height);
  gl.bindVertexArray(vao);

  // Enable blending for transparent images
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // Render image
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, image.texture);
  gl.uniform1i(uniforms.image, 0);
  gl.uniform1i(uniforms.isImage, 1);
  gl.uniform2f(uniforms.position, image.x, image.y);
  gl.uniform2f(uniforms.size, image.width / 2, image.height / 2);
  gl.uniform1i(uniforms.flipX, image.flipped ? 1 : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Disable blending after rendering the image
  gl.disable(gl.BLEND);

  // Render border if selected
  if (isSelected) {
    gl.uniform1i(uniforms.isImage, 0);
    gl.uniform4fv(uniforms.color, [1, 0.8, 0, 1]);

    const borderWidth = 2;
    const halfWidth = image.width / 2;
    const halfHeight = image.height / 2;

    gl.lineWidth(borderWidth);

    // Top border
    gl.uniform2f(uniforms.position, image.x, image.y - halfHeight);
    gl.uniform2f(uniforms.size, halfWidth, 0);
    gl.drawArrays(gl.LINES, 0, 2);

    // Bottom border
    gl.uniform2f(uniforms.position, image.x, image.y + halfHeight);
    gl.uniform2f(uniforms.size, halfWidth, 0);
    gl.drawArrays(gl.LINES, 0, 2);

    // Left border
    gl.uniform2f(uniforms.position, image.x - halfWidth, image.y);
    gl.uniform2f(uniforms.size, 0, halfHeight);
    gl.drawArrays(gl.LINES, 1, 2);

    // Right border
    gl.uniform2f(uniforms.position, image.x + halfWidth, image.y);
    gl.uniform2f(uniforms.size, 0, halfHeight);
    gl.drawArrays(gl.LINES, 1, 2);

    // Render resize handles
    const handleSize = 5;
    gl.uniform4fv(uniforms.color, [1, 1, 1, 1]);

    const renderHandle = (x, y) => {
      gl.uniform2f(uniforms.position, x, y);
      gl.uniform2f(uniforms.size, handleSize, handleSize);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    // Corner handles
    renderHandle(image.x - halfWidth, image.y - halfHeight);
    renderHandle(image.x + halfWidth, image.y - halfHeight);
    renderHandle(image.x - halfWidth, image.y + halfHeight);
    renderHandle(image.x + halfWidth, image.y + halfHeight);

    // Middle handles
    renderHandle(image.x, image.y - halfHeight);
    renderHandle(image.x, image.y + halfHeight);
    renderHandle(image.x - halfWidth, image.y);
    renderHandle(image.x + halfWidth, image.y);

    // Render toolbar
    if (toolbar && toolbar.buttonTextures.length > 0) {
      renderToolbar(gl, uniforms, toolbar, image);
    }
  }

  gl.bindVertexArray(null);
};


export const isPointInToolbar = (x, y, toolbar, image) => {
  const toolbarY = image.y - image.height / 2 - toolbar.buttonHeight - toolbar.gap;
  const toolbarWidth = toolbar.buttonTextures.length * toolbar.buttonWidth;
  const toolbarX = image.x - toolbarWidth / 2;

  return x >= toolbarX && x <= toolbarX + toolbarWidth && y >= toolbarY && y <= toolbarY + toolbar.buttonHeight;
};

export const getClickedButton = (x, y, toolbar, image) => {
  const toolbarY = image.y - image.height / 2 - toolbar.buttonHeight - toolbar.gap;
  const toolbarWidth = toolbar.buttonTextures.length * toolbar.buttonWidth;
  const toolbarX = image.x - toolbarWidth / 2;

  if (y >= toolbarY && y <= toolbarY + toolbar.buttonHeight) {
    for (let i = 0; i < toolbar.buttonTextures.length; i++) {
      const buttonX = toolbarX + i * (toolbar.buttonWidth);
      if (x >= buttonX && x <= buttonX + toolbar.buttonWidth) {
        return i;
      }
    }
  }
  return -1;
};
