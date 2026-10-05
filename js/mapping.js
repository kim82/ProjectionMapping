// Corners are normalized from 0 to 1 (x right, y down), ordered TL, TR, BR, BL.
export const DEFAULT = {
  topLeft: [0.1, 0.1],
  topRight: [0.9, 0.1],
  bottomRight: [0.9, 0.9],
  bottomLeft: [0.1, 0.9]
};

export const KEYS = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];

export const clone = mapping => JSON.parse(JSON.stringify(mapping));
export const toArray = mapping => KEYS.map(key => mapping[key]);

// Return one projective correction factor per corner. Interpolated UVs divided by
// these factors form a homography; non-convex or degenerate quads use affine mapping.
export function quadQ(points) {
  const [topLeft, topRight, bottomRight, bottomLeft] = points;
  const diagonalX = bottomRight[0] - topLeft[0];
  const diagonalY = bottomRight[1] - topLeft[1];
  const oppositeX = bottomLeft[0] - topRight[0];
  const oppositeY = bottomLeft[1] - topRight[1];
  const denominator = diagonalX * oppositeY - diagonalY * oppositeX;

  if (Math.abs(denominator) < 1e-9) return [1, 1, 1, 1];

  const diagonalPosition = (
    (topRight[0] - topLeft[0]) * oppositeY
    - (topRight[1] - topLeft[1]) * oppositeX
  ) / denominator;
  const oppositePosition = (
    (topRight[0] - topLeft[0]) * diagonalY
    - (topRight[1] - topLeft[1]) * diagonalX
  ) / denominator;

  if (
    diagonalPosition <= 0 || diagonalPosition >= 1
    || oppositePosition <= 0 || oppositePosition >= 1
  ) {
    return [1, 1, 1, 1];
  }

  return [
    1 / (1 - diagonalPosition),
    1 / (1 - oppositePosition),
    1 / diagonalPosition,
    1 / oppositePosition
  ];
}
