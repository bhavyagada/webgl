export const imageVertexShader = `#version 300 es
  in vec2 a_position;
  in vec2 a_texCoord;

  uniform vec2 u_resolution;
  uniform vec2 u_position;
  uniform vec2 u_size;
  uniform float is_image;

  out vec2 v_texCoord;

  void main() {
    vec2 final_position;
    if (is_image == 1.0) {
      final_position = a_position;
    } else {
      final_position = a_position * u_size + u_position;
    }

    vec2 zero_to_one = final_position / u_resolution;
    vec2 zero_to_two = zero_to_one * 2.0;
    vec2 clip_space = zero_to_two - 1.0;
    gl_Position = vec4(clip_space * vec2(1, -1), 0, 1);
    v_texCoord = a_texCoord;
  }
`;

export const imageFragmentShader = `#version 300 es
  precision highp float;

  in vec2 v_texCoord;

  uniform sampler2D u_image;
  uniform vec4 u_color;
  uniform float is_image;

  out vec4 outColor;

  void main() {
    if (is_image == 1.0) {
      outColor = texture(u_image, v_texCoord);
    } else {
      outColor = u_color;
    }
  }
`;
