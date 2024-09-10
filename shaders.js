export const imageVertexShader = `#version 300 es
  in vec2 a_position;
  in vec2 a_texCoord;
  uniform vec2 u_resolution;
  uniform vec2 u_translation;
  out vec2 v_texCoord;
  void main() {
    vec2 zeroToOne = a_position / u_resolution;
    vec2 zeroToTwo = zeroToOne * 2.0;
    vec2 clipSpace = zeroToTwo - 1.0;
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    v_texCoord = a_texCoord;
  }
`;

export const imageFragmentShader = `#version 300 es
  precision highp float;
  uniform sampler2D u_image;
  in vec2 v_texCoord;
  out vec4 outColor;
  void main() {
    outColor = texture(u_image, v_texCoord);
  }
`;

