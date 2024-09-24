import { imageVertexShader, imageFragmentShader } from "./shaders";
import { createProgramFromShaders } from "./utils";

const setupAttribute = (gl, program, name, size, data) => {
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);

  const location = gl.getAttribLocation(program, name);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);

  return buffer;
}

export const createRenderer = (canvas, gl) => {
  const program = createProgramFromShaders(gl, imageVertexShader, imageFragmentShader);
  gl.useProgram(program);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  setupAttribute(gl, program, "a_position", 2, [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  setupAttribute(gl, program, "a_texCoord", 2, [0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]);
  gl.bindVertexArray(null);

  const uniforms = {
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    position: gl.getUniformLocation(program, 'u_position'),
    size: gl.getUniformLocation(program, 'u_size'),
    isImage: gl.getUniformLocation(program, 'is_image'),
    image: gl.getUniformLocation(program, 'u_image'),
    color: gl.getUniformLocation(program, 'u_color'),
    flipX: gl.getUniformLocation(program, 'u_flipX'),
    depthMask: gl.getUniformLocation(program, 'u_depthMask'),
    isDepthMask: gl.getUniformLocation(program, "is_depthMask"),
    depthThreshold: gl.getUniformLocation(program, "u_depthThreshold")
  };
  gl.uniform1i(uniforms.image, 0);

  return { canvas, gl, program, uniforms, vao };
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
    const centerX = toolbarX + toolbar.buttonWidth / 2;
    const centerY = toolbarY + toolbar.buttonHeight / 2;

    // Render button background
    gl.uniform1i(uniforms.isImage, 0);
    gl.uniform4fv(uniforms.color, [1, 1, 1, 1]);
    gl.uniform2f(uniforms.position, centerX, centerY);
    gl.uniform2f(uniforms.size, toolbar.buttonWidth / 2, toolbar.buttonHeight / 2);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    if ((index === 0 && image.isEstimatingDepth) || (index === 1 && image.isEmbeddingInProgress)) {
      // Render loading animation
      const time = performance.now() / 1000;
      const radius = Math.min(toolbar.buttonWidth, toolbar.buttonHeight) * 0.3;
      const lineWidth = Math.min(toolbar.buttonWidth, toolbar.buttonHeight) * 0.05;
      const segments = 32;
      const angleStep = (Math.PI * 2) / segments;

      for (let i = 0; i < segments; i++) {
        const angle = i * angleStep + time * 5;
        const endAngle = angle + angleStep * 0.8;
        const [startX, startY] = [Math.cos(angle) * radius, Math.sin(angle) * radius];
        const [endX, endY] = [Math.cos(endAngle) * radius, Math.sin(endAngle) * radius];
        const [midX, midY] = [(startX + endX) / 2, (startY + endY) / 2];
        const [dirX, dirY] = [endX - startX, endY - startY];
        const length = Math.sqrt(dirX * dirX + dirY * dirY);

        gl.uniform2f(uniforms.position, centerX + midX, centerY + midY);
        gl.uniform2f(uniforms.size, length / 2, lineWidth / 2);
        gl.uniform4fv(uniforms.color, [0, 0, 0, Math.max(0, Math.sin(i / segments * Math.PI))]);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
    } else {
      // Render button icon
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform1i(uniforms.isImage, 1);
      gl.uniform2f(uniforms.position, centerX, centerY);
      gl.uniform2f(uniforms.size, toolbar.buttonWidth / 2, toolbar.buttonHeight / 2);
      gl.uniform1i(uniforms.flipX, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  });
};

export const renderSegmentMask = (renderer, image) => {
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
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageElement);

  return { id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15), imageElement, texture, x, y, width: imageElement.width, height: imageElement.height, flipped: false, depthThreshold: 0.0, isEstimatingDepth: false, isEmbeddingInProgress: false };
};

export const renderImage = (renderer, image, isSelected, toolbar, isCropping) => {
  const { gl, program, vao, uniforms } = renderer;

  gl.useProgram(program);
  gl.bindVertexArray(vao);

  gl.uniform2f(uniforms.resolution, gl.canvas.width, gl.canvas.height);
  gl.uniform2f(uniforms.position, image.x, image.y);
  gl.uniform2f(uniforms.size, image.width / 2, image.height / 2);
  gl.uniform1i(uniforms.flipX, image.flipped ? 1 : 0);

  // Render image with depth mask
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, image.texture);
  gl.uniform1i(uniforms.isImage, 1);

  if (image.depthMaskCanvas) {
    gl.activeTexture(gl.TEXTURE1);
    const depthMaskTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, depthMaskTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image.depthMaskCanvas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.uniform1i(uniforms.isDepthMask, 1);
    gl.uniform1i(uniforms.depthMask, 1);
    gl.uniform1f(uniforms.depthThreshold, image.depthThreshold);
  } else {
    gl.uniform1i(uniforms.isDepthMask, 0);
  }

  gl.drawArrays(gl.TRIANGLES, 0, 6);
  gl.disable(gl.BLEND);

  // Reset depth mask uniforms
  gl.uniform1i(uniforms.isDepthMask, 0);
  gl.uniform1i(uniforms.depthMask, 0);

  // Render border if selected
  if (isSelected) {
    gl.uniform1i(uniforms.isImage, 0);
    gl.uniform4fv(uniforms.color, [1, 0.8, 0, 1]);

    const halfWidth = image.width / 2;
    const halfHeight = image.height / 2;

    // Render border lines
    const borderPositions = [
      [0, -halfHeight], [0, halfHeight],  // Top and bottom
      [-halfWidth, 0], [halfWidth, 0]     // Left and right
    ];

    borderPositions.forEach(([x, y]) => {
      gl.uniform2f(uniforms.position, image.x + x, image.y + y);
      gl.uniform2f(uniforms.size, x ? 0 : halfWidth, y ? 0 : halfHeight);
      gl.drawArrays(gl.LINES, y ? 0 : 1, 2);
    });

    // Render resize handles
    if (!isCropping) {
      gl.uniform4fv(uniforms.color, [1, 1, 1, 1]);
      gl.uniform2f(uniforms.size, 5, 5);

      const handlePositions = [
        [-halfWidth, -halfHeight], [halfWidth, -halfHeight], // corner
        [-halfWidth, halfHeight], [halfWidth, halfHeight], // corner
        [0, -halfHeight], [0, halfHeight], // middle
        [-halfWidth, 0], [halfWidth, 0] // middle
      ];

      handlePositions.forEach(([x, y]) => {
        gl.uniform2f(uniforms.position, image.x + x, image.y + y);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      });
    }

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

export const renderCropOverlay = (renderer, image) => {
  const { gl, program, vao, uniforms } = renderer;

  gl.useProgram(program);
  gl.bindVertexArray(vao);

  gl.uniform2f(uniforms.resolution, gl.canvas.width, gl.canvas.height);
  gl.uniform1i(uniforms.isImage, 0);
  gl.uniform1i(uniforms.isDepthMask, 0);

  // Enable blending for transparent overlay
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  // Render crop overlay
  gl.uniform4fv(uniforms.color, [0, 0, 0, 0.5]);
  gl.uniform2f(uniforms.position, image.cropArea.x + image.cropArea.width / 2, image.cropArea.y + image.cropArea.height / 2);
  gl.uniform2f(uniforms.size, image.cropArea.width / 2, image.cropArea.height / 2);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Render crop handles
  gl.uniform4fv(uniforms.color, [1, 1, 1, 1]);
  gl.uniform2f(uniforms.size, 5, 5);

  const renderHandle = (x, y) => {
    gl.uniform2f(uniforms.position, x, y);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };

  // Corner handles
  renderHandle(image.cropArea.x, image.cropArea.y);
  renderHandle(image.cropArea.x + image.cropArea.width, image.cropArea.y);
  renderHandle(image.cropArea.x, image.cropArea.y + image.cropArea.height);
  renderHandle(image.cropArea.x + image.cropArea.width, image.cropArea.y + image.cropArea.height);

  // Middle handles
  renderHandle(image.cropArea.x + image.cropArea.width / 2, image.cropArea.y);
  renderHandle(image.cropArea.x + image.cropArea.width / 2, image.cropArea.y + image.cropArea.height);
  renderHandle(image.cropArea.x, image.cropArea.y + image.cropArea.height / 2);
  renderHandle(image.cropArea.x + image.cropArea.width, image.cropArea.y + image.cropArea.height / 2);

  // Disable blending after rendering the overlay and handles
  gl.disable(gl.BLEND);
  gl.bindVertexArray(null);
};

export const renderDepthSlider = (renderer, image, isDepthSliderVisible) => {
  if (!isDepthSliderVisible || !image.depthData) return;

  const { gl, program, vao, uniforms } = renderer;

  gl.useProgram(program);
  gl.bindVertexArray(vao);

  // Render slider background
  gl.uniform1i(uniforms.isImage, 0);
  gl.uniform4fv(uniforms.color, [0.5, 0.5, 0.5, 1]);
  gl.uniform2f(uniforms.position, image.x, image.y + image.height / 2 + 20);
  gl.uniform2f(uniforms.size, image.width / 2, 5);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Render slider handle
  gl.uniform4fv(uniforms.color, [1, 1, 1, 1]);
  gl.uniform2f(uniforms.position, image.x - image.width / 2 + image.depthThreshold * image.width, image.y + image.height / 2 + 20);
  gl.uniform2f(uniforms.size, 10, 10);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  gl.bindVertexArray(null);
};
