import { imageVertexShader, imageFragmentShader } from "./shaders";
import { createProgramFromShaders } from "./utils";

export const createRenderer = (canvas, gl) => {
  const program = createProgramFromShaders(gl, imageVertexShader, imageFragmentShader);

  const positionAttribLocation = gl.getAttribLocation(program, "a_position");
  const texCoordAttribLocation = gl.getAttribLocation(program, "a_texCoord");

  const vao = gl.createVertexArray();
  const positionBuffer = gl.createBuffer();
  const texCoordBuffer = gl.createBuffer();

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.vertexAttribPointer(positionAttribLocation, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(positionAttribLocation);

  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
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
      color: gl.getUniformLocation(program, 'u_color')
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
  gl.clearColor(0.1, 0.1, 0.1, 1.0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
};

export const createToolbar = (gl) => {
  return {
    buttonWidth: 30,
    buttonHeight: 30,
    gap: 10,
    buttonTextures: []
  };
};

export const loadToolbarTexture = (gl, imageSources) => {
  return Promise.all(imageSources.map(src => {
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
};

export const renderToolbar = (gl, program, vao, positionBuffer, texCoordBuffer, uniforms, toolbar, image) => {
  const toolbarY = image.y - image.height / 2 - toolbar.buttonHeight - toolbar.gap;
  
  gl.bindVertexArray(vao);
  toolbar.buttonTextures.forEach((texture, index) => {
    const toolbarX = image.x - (toolbar.buttonTextures.length * toolbar.buttonWidth + (toolbar.buttonTextures.length - 1) * toolbar.gap) / 2 + index * (toolbar.buttonWidth + toolbar.gap);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.image, 0);
    gl.uniform1i(uniforms.isImage, true);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      toolbarX, toolbarY,
      toolbarX + toolbar.buttonWidth, toolbarY,
      toolbarX, toolbarY + toolbar.buttonHeight,
      toolbarX, toolbarY + toolbar.buttonHeight,
      toolbarX + toolbar.buttonWidth, toolbarY,
      toolbarX + toolbar.buttonWidth, toolbarY + toolbar.buttonHeight
    ]), gl.STATIC_DRAW);

    // Use non-flipped texture coordinates for toolbar buttons
    gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      0.0, 0.0,
      1.0, 0.0,
      0.0, 1.0,
      0.0, 1.0,
      1.0, 0.0,
      1.0, 1.0
    ]), gl.STATIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  });
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
    texture,
    x,
    y,
    width: imageElement.width,
    height: imageElement.height,
    flipped: false
  };
};

export const renderImage = (renderer, image, isSelected, toolbar) => {
  const { gl, program, vao, uniforms, positionBuffer, texCoordBuffer } = renderer;

  gl.useProgram(program);
  gl.uniform2f(uniforms.resolution, gl.canvas.width, gl.canvas.height);

  // Render image
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, image.texture);
  gl.uniform1i(uniforms.image, 0);
  gl.uniform1i(uniforms.isImage, true);

  gl.bindVertexArray(vao);
  const halfWidth = image.width / 2;
  const halfHeight = image.height / 2;
  const x1 = image.x - halfWidth;
  const x2 = image.x + halfWidth;
  const y1 = image.y - halfHeight;
  const y2 = image.y + halfHeight;
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
		x1, y1,
		x2, y1,
		x1, y2,
		x1, y2,
		x2, y1,
		x2, y2]), gl.STATIC_DRAW);
  
  // Update texture coordinates based on flipped state
  const texCoords = image.flipped
    ? [1.0, 0.0,
       0.0, 0.0,
       1.0, 1.0,
       1.0, 1.0,
       0.0, 0.0,
       0.0, 1.0] 
    : [0.0, 0.0,
       1.0, 0.0,
       0.0, 1.0,
       0.0, 1.0,
       1.0, 0.0,
       1.0, 1.0];
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(texCoords), gl.STATIC_DRAW);

  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Render border if selected
  if (isSelected) {
    gl.uniform1i(uniforms.isImage, false);
    gl.uniform4fv(uniforms.color, [1, 0.8, 0, 1]);
    gl.uniform2f(uniforms.position, image.x, image.y);
    gl.uniform2f(uniforms.size, image.width + 4, image.height + 4);

    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
			-0.5, -0.5,
			0.5, -0.5,
			0.5, 0.5,
			-0.5, 0.5
		]), gl.STATIC_DRAW);
    gl.drawArrays(gl.LINE_LOOP, 0, 4);

    // Render toolbar
    if (toolbar && toolbar.buttonTextures.length > 0) {
      renderToolbar(gl, program, vao, positionBuffer, texCoordBuffer, uniforms, toolbar, image);
    }
  }

  gl.bindVertexArray(null);
};

export const isPointInToolbar = (x, y, toolbar, image) => {
  const toolbarY = image.y - image.height / 2 - toolbar.buttonHeight - toolbar.gap;
  const toolbarWidth = toolbar.buttonTextures.length * toolbar.buttonWidth + (toolbar.buttonTextures.length - 1) * toolbar.gap;
  const toolbarX = image.x - toolbarWidth / 2;

  return x >= toolbarX && x <= toolbarX + toolbarWidth && y >= toolbarY && y <= toolbarY + toolbar.buttonHeight;
};

export const getClickedButton = (x, y, toolbar, image) => {
  const toolbarY = image.y - image.height / 2 - toolbar.buttonHeight - toolbar.gap;
  const toolbarWidth = toolbar.buttonTextures.length * toolbar.buttonWidth + (toolbar.buttonTextures.length - 1) * toolbar.gap;
  const toolbarX = image.x - toolbarWidth / 2;

  if (y >= toolbarY && y <= toolbarY + toolbar.buttonHeight) {
    for (let i = 0; i < toolbar.buttonTextures.length; i++) {
      const buttonX = toolbarX + i * (toolbar.buttonWidth + toolbar.gap);
      if (x >= buttonX && x <= buttonX + toolbar.buttonWidth) {
        return i;
      }
    }
  }
  return -1;
};
