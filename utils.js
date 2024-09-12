import { imageVertexShader, imageFragmentShader } from "./shaders";

const createShader = (gl, type, source) => {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (success) return shader;
  console.log(gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

const createProgram = (gl, vertexShader, fragmentShader) => {
  let program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  let success = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (success) return program;
  console.log(gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
  return null;
}

export const createProgramFromShaders = (gl) => {
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, imageVertexShader);
	const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, imageFragmentShader);
	const program = createProgram(gl, vertexShader, fragmentShader);
	if (!program) {
		console.error("Failed to create shader program");
		return null;
	}
  return program
}
