export const imageVertexShader = `#version 300 es
  in vec2 a_position;
  in vec2 a_texCoord;

  uniform vec2 u_resolution;
  uniform vec2 u_position;
  uniform vec2 u_size;
  uniform bool is_image;
  uniform bool u_flipX;

  out vec2 v_texCoord;

  void main() {
    vec2 final_position = a_position * u_size + u_position;
    vec2 zero_to_one = final_position / u_resolution;
    vec2 zero_to_two = zero_to_one * 2.0;
    vec2 clip_space = zero_to_two - 1.0;
    gl_Position = vec4(clip_space * vec2(1, -1), 0, 1);
    
    v_texCoord = a_texCoord;
    if (u_flipX) {
      v_texCoord.x = 1.0 - v_texCoord.x;
    }
  }
`;

export const imageFragmentShader = `#version 300 es
  precision highp float;

  uniform sampler2D u_image;
  uniform sampler2D u_depthMask;
  uniform vec4 u_color;
  uniform bool is_image;
  uniform bool is_depthMask;
  uniform float u_depthThreshold;

  in vec2 v_texCoord;
  out vec4 outColor;

  void main() {
    if (is_image) {
      vec4 color = texture(u_image, v_texCoord);
      if (is_depthMask) {
        vec4 depthMaskColor = texture(u_depthMask, v_texCoord);
        float depth = depthMaskColor.r;
        if (depth <= u_depthThreshold) {
          discard;
        }
      }
      outColor = color;
    } else {
      outColor = u_color;
    }
  }
`;
