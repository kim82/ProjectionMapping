import { KEYS } from './mapping.js?v=20261005';

// Draws the calibration overlay and lets users drag its normalized corner handles.
export class Calibration {
  constructor(canvas, getMapping, onChange) {
    this.canvas = canvas;
    this.getMapping = getMapping;
    this.onChange = onChange;
    this.showGrid = true;
    this.activeCorner = null;
    this.hoveredCorner = null;
    this.hitRadius = 22;

    canvas.addEventListener('pointerdown', event => this.onPointerDown(event));
    canvas.addEventListener('pointermove', event => this.onPointerMove(event));

    const onPointerUp = () => {
      this.activeCorner = null;
      this.draw();
    };
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
  }

  getNormalizedPosition(event) {
    const bounds = this.canvas.getBoundingClientRect();
    return [
      (event.clientX - bounds.left) / bounds.width,
      (event.clientY - bounds.top) / bounds.height
    ];
  }

  getCornerAtPointer(event) {
    const bounds = this.canvas.getBoundingClientRect();
    const mapping = this.getMapping();
    let closestCorner = null;
    let closestDistance = this.hitRadius;

    for (const corner of KEYS) {
      const distance = Math.hypot(
        mapping[corner][0] * bounds.width - (event.clientX - bounds.left),
        mapping[corner][1] * bounds.height - (event.clientY - bounds.top)
      );

      if (distance < closestDistance) {
        closestDistance = distance;
        closestCorner = corner;
      }
    }

    return closestCorner;
  }

  onPointerDown(event) {
    const corner = this.getCornerAtPointer(event);
    if (!corner) return;

    this.activeCorner = corner;
    this.canvas.setPointerCapture(event.pointerId);
    event.preventDefault();
    this.onPointerMove(event);
  }

  onPointerMove(event) {
    if (this.activeCorner) {
      const [x, y] = this.getNormalizedPosition(event);
      this.getMapping()[this.activeCorner] = [
        Math.min(1, Math.max(0, x)),
        Math.min(1, Math.max(0, y))
      ];
      this.onChange();
      return;
    }

    const hoveredCorner = this.getCornerAtPointer(event);
    if (hoveredCorner !== this.hoveredCorner) {
      this.hoveredCorner = hoveredCorner;
      this.draw();
    }
  }

  draw() {
    const canvas = this.canvas;
    const pixelRatio = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const pixelWidth = Math.round(width * pixelRatio);
    const pixelHeight = Math.round(height * pixelRatio);

    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }

    const context = canvas.getContext('2d');
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.clearRect(0, 0, width, height);

    const mapping = this.getMapping();
    const points = KEYS.map(corner => [
      mapping[corner][0] * width,
      mapping[corner][1] * height
    ]);

    context.strokeStyle = '#ff9f1c';
    context.lineWidth = 1.5;
    context.beginPath();
    points.forEach((point, index) => {
      if (index) context.lineTo(...point);
      else context.moveTo(...point);
    });
    context.closePath();
    context.stroke();

    if (this.showGrid) this.drawGrid(context, points);
    this.drawHandles(context, points);
  }

  drawGrid(context, points) {
    const interpolate = (start, end, amount) => [
      start[0] + (end[0] - start[0]) * amount,
      start[1] + (end[1] - start[1]) * amount
    ];

    context.strokeStyle = 'rgba(255,159,28,.35)';
    context.lineWidth = 1;

    for (let index = 1; index < 8; index += 1) {
      const amount = index / 8;
      const linePairs = [
        [points[0], points[1], points[3], points[2]],
        [points[0], points[3], points[1], points[2]]
      ];

      for (const [startA, endA, startB, endB] of linePairs) {
        context.beginPath();
        context.moveTo(...interpolate(startA, endA, amount));
        context.lineTo(...interpolate(startB, endB, amount));
        context.stroke();
      }
    }
  }

  drawHandles(context, points) {
    KEYS.forEach((corner, index) => {
      const [x, y] = points[index];
      const isHighlighted = this.activeCorner === corner || this.hoveredCorner === corner;

      context.beginPath();
      context.arc(x, y, isHighlighted ? 13 : 10, 0, 7);
      context.fillStyle = isHighlighted ? '#ff9f1c' : 'rgba(255,159,28,.35)';
      context.fill();
      context.strokeStyle = '#fff';
      context.lineWidth = 2;
      context.stroke();
    });
  }
}
