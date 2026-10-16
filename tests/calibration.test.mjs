import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Calibration } from '../js/controls.js';
import { DEFAULT, KEYS, clone } from '../js/mapping.js';

globalThis.window = { addEventListener() {}, devicePixelRatio: 1 };

const closeTo = (actual, expected) => {
  actual.forEach((value, index) => {
    assert.ok(Math.abs(value - expected[index]) < 1e-12, `${actual} != ${expected}`);
  });
};

function setup(rotation) {
  const mapping = clone(DEFAULT);
  const handles = [];
  const context = {
    setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
    closePath() {}, stroke() {}, fill() {},
    arc(x, y) { handles.push([x, y]); }
  };
  const bounds = { left: 30, top: 50, width: 360, height: 640 };
  const canvas = {
    clientWidth: bounds.width,
    clientHeight: bounds.height,
    addEventListener() {},
    setPointerCapture() {},
    getBoundingClientRect: () => bounds,
    getContext: () => context
  };
  let changes = 0;
  const calibration = new Calibration(canvas, () => mapping, () => changes++);
  calibration.rotationDegrees = rotation;
  const pointerAt = ([x, y]) => ({
    clientX: bounds.left + x * bounds.width,
    clientY: bounds.top + y * bounds.height,
    pointerId: 1,
    preventDefault() {}
  });
  return { calibration, mapping, handles, bounds, pointerAt, changes: () => changes };
}

const expectedPositions = [
  [0.2, 0.3],
  [0.7, 0.2],
  [0.8, 0.7],
  [0.3, 0.8]
];

for (const [index, rotation] of [0, 90, 180, 270].entries()) {
  test(`${rotation} degrees: view transform and inverse`, () => {
    const { calibration } = setup(rotation);
    closeTo(calibration.toView([0.2, 0.3]), expectedPositions[index]);
    for (const point of [[0, 0], [1, 1], [0, 1], [1, 0], [0.23, 0.74]]) {
      closeTo(calibration.fromView(calibration.toView(point)), point);
    }
  });

  test(`${rotation} degrees: drawing and hit testing follow the view`, () => {
    const { calibration, mapping, handles, bounds, pointerAt } = setup(rotation);
    calibration.draw();
    KEYS.forEach((key, cornerIndex) => {
      const position = calibration.toView(mapping[key]);
      closeTo(handles[cornerIndex], [
        position[0] * bounds.width, position[1] * bounds.height
      ]);
      assert.equal(calibration.getCornerAtPointer(pointerAt(position)), key);
    });
    assert.deepEqual(mapping, DEFAULT);
  });

  test(`${rotation} degrees: dragging updates output coordinates, not corner identity`, () => {
    for (const key of KEYS) {
      const { calibration, mapping, pointerAt, changes } = setup(rotation);
      calibration.onPointerDown(pointerAt(calibration.toView(mapping[key])));
      assert.equal(calibration.activeCorner, key);
      calibration.onPointerMove(pointerAt([0.35, 0.65]));
      closeTo(calibration.toView(mapping[key]), [0.35, 0.65]);
      KEYS.filter(other => other !== key).forEach(other => {
        assert.deepEqual(mapping[other], DEFAULT[other]);
      });
      assert.equal(changes(), 2);
    }
  });

  test(`${rotation} degrees: dragging clamps to the rotated display bounds`, () => {
    const { calibration, mapping, pointerAt } = setup(rotation);
    calibration.activeCorner = 'topLeft';
    calibration.onPointerMove(pointerAt([-0.5, 1.5]));
    closeTo(calibration.toView(mapping.topLeft), [0, 1]);
    assert.ok(mapping.topLeft.every(value => value >= 0 && value <= 1));
  });

  test(`${rotation} degrees: arrow keys move in screen directions`, () => {
    const directions = {
      ArrowUp: [0, -0.001],
      ArrowDown: [0, 0.001],
      ArrowLeft: [-0.001, 0],
      ArrowRight: [0.001, 0]
    };
    for (const [key, delta] of Object.entries(directions)) {
      const { calibration, mapping, changes } = setup(rotation);
      calibration.hoveredCorner = 'topLeft';
      const before = calibration.toView(mapping.topLeft);
      let prevented = false;
      calibration.onKeyDown({ key, preventDefault() { prevented = true; } });
      closeTo(calibration.toView(mapping.topLeft), [
        before[0] + delta[0], before[1] + delta[1]
      ]);
      assert.equal(changes(), 1);
      assert.equal(prevented, true);
    }
  });

  test(`${rotation} degrees: arrow keys clamp at the rotated edge`, () => {
    const { calibration, mapping } = setup(rotation);
    calibration.hoveredCorner = 'topLeft';
    mapping.topLeft = calibration.fromView([0, 1]);
    calibration.onKeyDown({ key: 'ArrowLeft', preventDefault() {} });
    calibration.onKeyDown({ key: 'ArrowDown', preventDefault() {} });
    closeTo(calibration.toView(mapping.topLeft), [0, 1]);
  });
}

test('unrelated keys do not modify a hovered corner or prevent shortcuts', () => {
  const { calibration, mapping, changes } = setup(90);
  calibration.hoveredCorner = 'topLeft';
  calibration.onKeyDown({
    key: 't',
    preventDefault() { assert.fail('Unrelated key was prevented'); }
  });
  assert.deepEqual(mapping, DEFAULT);
  assert.equal(changes(), 0);
});
