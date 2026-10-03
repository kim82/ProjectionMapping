// Corners are normalized 0-1 (x right, y down), order: TL, TR, BR, BL.
export const DEFAULT = {topLeft:[.1,.1],topRight:[.9,.1],bottomRight:[.9,.9],bottomLeft:[.1,.9]};
export const KEYS = ['topLeft','topRight','bottomRight','bottomLeft'];
export const clone = m => JSON.parse(JSON.stringify(m));
export const toArray = m => KEYS.map(k => m[k]);

// Projective correction factors via diagonal intersection. Returns q per corner,
// so that (u*q, v*q, q) interpolated linearly then divided per fragment gives a true homography.
export function quadQ(p) {
  const [a,b,c,d] = p; // TL TR BR BL
  const ax=c[0]-a[0], ay=c[1]-a[1], bx=d[0]-b[0], by=d[1]-b[1];
  const den = ax*by - ay*bx;
  if (Math.abs(den) < 1e-9) return [1,1,1,1];
  const t = ((b[0]-a[0])*by - (b[1]-a[1])*bx) / den; // along a->c
  const s = ((b[0]-a[0])*ay - (b[1]-a[1])*ax) / den; // along b->d
  if (t<=0||t>=1||s<=0||s>=1) return [1,1,1,1]; // non-convex: fall back to affine
  return [1/(1-t), 1/(1-s), 1/t, 1/s];
}
