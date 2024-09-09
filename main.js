let vertexShaderSource = `#version 300 es
in vec2 a_position;
in vec2 a_texCoord;

uniform vec2 u_resolution;

// pass the texture coordinates to fragment shader
out vec2 v_texCoord;

// all shaders have a main function
void main() {
  // convert position from pixels to 0.0 -> 1.0
  vec2 zeroToOne = a_position / u_resolution;

  // convert from 0->1 to 0->2
  vec2 zeroToTwo = zeroToOne * 2.0;

  // convert from 0->2 to -1->+1 (clip space)
  vec2 clipSpace = zeroToTwo - 1.0;

  // gl_Position is a special variable a vertex shader is responsible for setting
  gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);

  // pass to fragment shader, GPU will interpolate this value between points
  v_texCoord = a_texCoord;
}
`;

let fragmentShaderSource = `#version 300 es
// fragment shaders don't have a default precision so we need to pick one. highp (high precision) is a good default
precision highp float;

// our texture
uniform sampler2D u_image;

// the texCoords passed from vertex shader
in vec2 v_texCoord;

// declare an output for the fragment shader
out vec4 outColor;

void main() {
  outColor = texture(u_image, v_texCoord);
}
`;

const toDataURL = (url, callback) => {
  let xhr = new XMLHttpRequest();
  xhr.onload = function() {
    let reader = new FileReader();
    reader.onloadend = function() {
      callback(reader.result);
    }
    reader.readAsDataURL(xhr.response);
  }
  xhr.open('GET', url);
  xhr.responseType = "blob";
  xhr.send();
}

let image = new Image();
toDataURL("https://webgl2fundamentals.org/webgl/resources/leaves.jpg", (base64String) => {
  console.log(base64String);
  image.src = base64String;
  image.onload = function() {
    render(image);
  }
});

const createShader = (gl, type, source) => {
  let shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  let success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (success) {
    return shader;
  }

  console.log(gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return undefined;
}

const createProgram = (gl, vertexShader, fragmentShader) => {
  let program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  let success = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (success) {
    return program;
  }

  console.log(gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
  return undefined;
}

const render = (image) => {
  const canvas = document.querySelector("#c");

  const canvasToDisplaySizeMap = new Map([[canvas, [1000, 800]]]);

  const resizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      let width;
      let height;
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
      canvasToDisplaySizeMap.set(entry.target, [displayWidth, displayHeight]);
    }
  });
  resizeObserver.observe(canvas, { box: "content-box" });

  const resizeCanvasToDisplaySize = (canvas) => {
    // lookup the size the browser is displaying the canvas in CSS pixels
    const [displayWidth, displayHeight] = canvasToDisplaySizeMap.get(canvas);

    // check if canvas is not the same size
    const needResize = canvas.width !== displayWidth || canvas.height !== displayHeight;
    if (needResize) {
      // make the canvas the same size
      canvas.width = displayWidth;
      canvas.height = displayHeight;
    }

    return needResize;
  }

  // initialize the GL2 context
  const gl = canvas.getContext("webgl2");

  // only continue if WebGL is available and working
  if (!gl) {
    return;
  }

  let vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  let fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

  let program = createProgram(gl, vertexShader, fragmentShader);

  // lookup where vertex data needs to go
  let positionAttributeLocation = gl.getAttribLocation(program, "a_position");
  let texCoordAttributeLocation = gl.getAttribLocation(program, "a_texCoord");

  // lookup uniform locations
  let resolutionUniformLocation = gl.getUniformLocation(program, "u_resolution");
  let imageLocation = gl.getUniformLocation(program, "u_image");

  // create a buffer
  let positionBuffer = gl.createBuffer();

  // create a vertex array object (attribute state)
  let vao = gl.createVertexArray();

  // and make it the one we're currently working with
  gl.bindVertexArray(vao);

  // turn on the attribute
  gl.enableVertexAttribArray(positionAttributeLocation);

  // bind it to ARRAY_BUFFER (ARRAY_BUFFER = positionBuffer)
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

  // provide texture coordinates for the rectangle
  let texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    0.0, 0.0,
    1.0, 0.0,
    0.0, 1.0,
    0.0, 1.0,
    1.0, 0.0,
    1.0, 1.0,
  ]), gl.STATIC_DRAW);

  gl.enableVertexAttribArray(texCoordAttributeLocation);
  gl.vertexAttribPointer(texCoordAttributeLocation, 2, gl.FLOAT, false, 0, 0);

  // create a texture
  let texture = gl.createTexture();

  // make unit 0 the active texture unit
  // i.e. the unit all other texture commands will affect
  gl.activeTexture(gl.TEXTURE0 + 0)

  // bind it to texture 0' 2D bind point
  gl.bindTexture(gl.TEXTURE_2D, texture);

  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

  // upload the image to texture
  // let mipLevel = 0; // the largest mip
  // let internalFormat = gl.RGBA; // format we want in the texture
  // let srcFormat = gl.RGBA; // format of data we are supplying
  // let srcType = gl.UNSIGNED_BYTE; // type of data we are supplying
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

  resizeCanvasToDisplaySize(gl.canvas);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  // clear the canvas
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // tell WebGL to use our program
  gl.useProgram(program);

  // bind the attribute/buffer set we want
  gl.bindVertexArray(vao);

  // tell the attribute how to get data out of positionBuffer (ARRAY_BUFFER)
  // let size = 2; // 2 components per iteration
  // let type = gl.FLOAT; // data is 32bit floats
  // let normalize = false; // dont normalize the data
  // let stride = 0; // 0 = move forward size * sizeof(type) each iteration to get the next position
  // let offset = 0; // start at the beginning of the buffer

  // let primitiveType = gl.TRIANGLES;
  // let triCount = 3;
  // let rectCount = 6;

  // pass the canvas resolution so we can convert from pixels to clipspace in the shader
  gl.uniform2f(resolutionUniformLocation, gl.canvas.width, gl.canvas.height);

  // tell the shader to get the texture from texture unit 0
  gl.uniform1i(imageLocation, 0);

  // bind the position so gl.bufferData in setRectangle puts data in positionBuffer
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

  // sets a rectangle the same size as the image
  setRectangle(gl, 0, 0, image.width, image.height);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

// fill the buffer with the values that define a rectangle
const setRectangle = (gl, x, y, width, height) => {
  let x1 = x;
  let x2 = x1 + width;
  let y1 = y;
  let y2 = y1 + height;
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
    x1, y1,
    x2, y1,
    x1, y2,
    x1, y2,
    x2, y1,
    x2, y2,
  ]), gl.STATIC_DRAW);
}

