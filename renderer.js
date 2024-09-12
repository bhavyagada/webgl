import { createProgramFromShaders } from "./utils";

export const createRenderer = (canvas, gl) => {
	const program = createProgramFromShaders(gl);

	const renderer = {
		canvas,
		gl,
		program,
		attributes: {
			position: gl.getAttribLocation(program, "a_position"),
			texCoord: gl.getAttribLocation(program, "a_texCoord")
		},
		uniforms: {
			resolution: gl.getUniformLocation(program, 'u_resolution'),
			position: gl.getUniformLocation(program, 'u_position'),
			size: gl.getUniformLocation(program, 'u_size'),
			isImage: gl.getUniformLocation(program, 'is_image'),
			image: gl.getUniformLocation(program, 'u_image'),
			color: gl.getUniformLocation(program, 'u_color')
		},
		vao: gl.createVertexArray(),
		positionBuffer: gl.createBuffer(),
		texCoordBuffer: gl.createBuffer()
	};

	gl.bindVertexArray(renderer.vao);

	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.positionBuffer);
	gl.enableVertexAttribArray(renderer.attributes.position);
	gl.vertexAttribPointer(renderer.attributes.position, 2, gl.FLOAT, false, 0, 0);

	gl.bindBuffer(gl.ARRAY_BUFFER, renderer.texCoordBuffer);
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
		0.0, 0.0,
		1.0, 0.0,
		0.0, 1.0,
		0.0, 1.0,
		1.0, 0.0,
		1.0, 1.0
	]), gl.STATIC_DRAW);
	gl.enableVertexAttribArray(renderer.attributes.texCoord);
	gl.vertexAttribPointer(renderer.attributes.texCoord, 2, gl.FLOAT, false, 0, 0);

  return renderer;
};

export const resizeRenderer = (renderer, multiplier = 1) => {
	const { canvas, gl } = renderer;
	const width = Math.floor(canvas.clientWidth * multiplier);
	const height = Math.floor(canvas.clientHeight * multiplier);
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
	gl.clearColor(0.3, 0.3, 0.3, 1.0);
	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
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
  };
};

export const renderImage = (renderer, image, isSelected) => {
  const { gl, program, vao, uniforms, positionBuffer } = renderer;

  gl.useProgram(program);
  gl.bindVertexArray(vao);

  gl.uniform2f(uniforms.resolution, gl.canvas.width, gl.canvas.height);

  // Render image
  gl.activeTexture(gl.TEXTURE0 + 0);
  gl.bindTexture(gl.TEXTURE_2D, image.texture);
  gl.uniform1i(uniforms.image, 0);
  gl.uniform1f(uniforms.isImage, 1.0);

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  const halfWidth = image.width / 2;
  const halfHeight = image.height / 2;
  const x1 = image.x - halfWidth;
  const x2 = image.x + halfWidth;
  const y1 = image.y - halfHeight;
  const y2 = image.y + halfHeight;
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
		x1, y1,
		x2, y1,
		x1, y2,
		x1, y2,
		x2, y1,
		x2, y2]), gl.STATIC_DRAW);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  // Render border if selected
  if (isSelected) {
    gl.uniform1f(uniforms.isImage, 0.0);
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
  }

  gl.bindVertexArray(null);
};
