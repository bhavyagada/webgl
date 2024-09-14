export const m3 = {
  identity: () => new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
  translation: (tx, ty) => new Float32Array([1, 0, 0, 0, 1, 0, tx, ty, 1]),
  rotation: (angleInRadians) => {
    const c = Math.cos(angleInRadians);
    const s = Math.sin(angleInRadians);
    return new Float32Array([c, -s, 0, s, c, 0, 0, 0, 1]);
  },
  scaling: (sx, sy) => new Float32Array([sx, 0, 0, 0, sy, 0, 0, 0, 1]),
  multiply: (a, b) => {
    const a00 = a[0 * 3 + 0];
    const a01 = a[0 * 3 + 1];
    const a02 = a[0 * 3 + 2];
    const a10 = a[1 * 3 + 0];
    const a11 = a[1 * 3 + 1];
    const a12 = a[1 * 3 + 2];
    const a20 = a[2 * 3 + 0];
    const a21 = a[2 * 3 + 1];
    const a22 = a[2 * 3 + 2];
    const b00 = b[0 * 3 + 0];
    const b01 = b[0 * 3 + 1];
    const b02 = b[0 * 3 + 2];
    const b10 = b[1 * 3 + 0];
    const b11 = b[1 * 3 + 1];
    const b12 = b[1 * 3 + 2];
    const b20 = b[2 * 3 + 0];
    const b21 = b[2 * 3 + 1];
    const b22 = b[2 * 3 + 2];
    return new Float32Array([
      b00 * a00 + b01 * a10 + b02 * a20,
      b00 * a01 + b01 * a11 + b02 * a21,
      b00 * a02 + b01 * a12 + b02 * a22,
      b10 * a00 + b11 * a10 + b12 * a20,
      b10 * a01 + b11 * a11 + b12 * a21,
      b10 * a02 + b11 * a12 + b12 * a22,
      b20 * a00 + b21 * a10 + b22 * a20,
      b20 * a01 + b21 * a11 + b22 * a21,
      b20 * a02 + b21 * a12 + b22 * a22,
    ]);
  },
  translate: (m, tx, ty) => m3.multiply(m, m3.translation(tx, ty)),
  rotate: (m, angleInRadians) => m3.multiply(m, m3.rotation(angleInRadians)),
  scale: (m, sx, sy) => m3.multiply(m, m3.scaling(sx, sy)),
  projection: (width, height) => new Float32Array([2 / width, 0, 0, 0, -2 / height, 0, -1, 1, 1]),
  inverse: (m) => {
    const [m00, m01, m02, m10, m11, m12, m20, m21, m22] = m;
    const det = m00 * (m11 * m22 - m12 * m21) - m01 * (m10 * m22 - m12 * m20) + m02 * (m10 * m21 - m11 * m20);
    const invDet = 1 / det;
    return new Float32Array([
      (m11 * m22 - m21 * m12) * invDet,
      (m02 * m21 - m01 * m22) * invDet,
      (m01 * m12 - m02 * m11) * invDet,
      (m12 * m20 - m10 * m22) * invDet,
      (m00 * m22 - m02 * m20) * invDet,
      (m10 * m02 - m00 * m12) * invDet,
      (m10 * m21 - m20 * m11) * invDet,
      (m20 * m01 - m00 * m21) * invDet,
      (m00 * m11 - m10 * m01) * invDet
    ]);
  },
  transformPoint: (m, [x, y]) => {
    const d = x * m[2] + y * m[5] + m[8];
    return [(x * m[0] + y * m[3] + m[6]) / d, (x * m[1] + y * m[4] + m[7]) / d];
  },
}
