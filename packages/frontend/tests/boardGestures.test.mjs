import test from 'node:test';
import assert from 'node:assert/strict';
import { beginBoardPinch, moveBoardPinch } from '../src/lib/boardGestures.ts';

const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} ≈ ${expected}`);
const under = (view, point) => ({ x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale });
const sameView = (actual, expected) => { near(actual.x, expected.x); near(actual.y, expected.y); near(actual.scale, expected.scale); };

test('pinch distance controls zoom while the same world point follows the fingers midpoint', () => {
  const original = { x: -40, y: 30, scale: .7 };
  const start = [{ id: 1, x: 90, y: 200 }, { id: 2, x: 210, y: 200 }];
  const pinch = beginBoardPinch(original, start);
  const before = under(original, { x: 150, y: 200 });
  const next = moveBoardPinch(pinch, [{ id: 1, x: 70, y: 230 }, { id: 2, x: 310, y: 230 }]);
  near(next.scale, original.scale * 2);
  const after = under(next, { x: 190, y: 230 });
  near(before.x, after.x); near(before.y, after.y);
  sameView(moveBoardPinch(pinch, start), original);
});

test('pinch bounds do not move the anchor and coincident fingers never produce invalid coordinates', () => {
  const pinch = beginBoardPinch({ x: 50, y: -80, scale: 1 }, [{ id: 4, x: 0, y: 100 }, { id: 5, x: 100, y: 100 }]);
  const maximum = moveBoardPinch(pinch, [{ id: 4, x: -1000, y: 100 }, { id: 5, x: 1000, y: 100 }]);
  assert.equal(maximum.scale, 2.2);
  near(under(maximum, { x: 0, y: 100 }).x, pinch.anchor.x);
  near(under(maximum, { x: 0, y: 100 }).y, pinch.anchor.y);
  const minimum = moveBoardPinch(pinch, [{ id: 4, x: 30, y: 40 }, { id: 5, x: 30, y: 40 }]);
  assert.equal(minimum.scale, .05);
  assert.ok(Object.values(minimum).every(Number.isFinite));
  assert.equal(beginBoardPinch({ x: 0, y: 0, scale: 1 }, [{ id: 1, x: 1, y: 1 }, { id: 2, x: 1, y: 1 }]), null);
});

test('an extra finger does not replace the active pair, and a changed pair can rebase without a jump', () => {
  const start = [{ id: 1, x: 50, y: 50 }, { id: 2, x: 150, y: 50 }, { id: 3, x: 300, y: 300 }];
  const original = { x: -25, y: 12, scale: .8 };
  const pinch = beginBoardPinch(original, start);
  sameView(moveBoardPinch(pinch, [...start.slice(0, 2), { id: 3, x: 400, y: 100 }]), original);
  const remaining = start.slice(1);
  assert.equal(moveBoardPinch(pinch, remaining), null);
  const rebased = beginBoardPinch(original, remaining);
  sameView(moveBoardPinch(rebased, remaining), original);
  assert.equal(beginBoardPinch(original, remaining.slice(0, 1)), null);
});
