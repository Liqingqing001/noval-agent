export interface BoardViewTransform { x: number; y: number; scale: number }
export interface BoardTouchPoint { id: number; x: number; y: number }
export interface BoardPinch {
  ids: [number, number];
  distance: number;
  scale: number;
  anchor: { x: number; y: number };
}

/** Capture the world point between two fingers, so zooming and panning share one anchor. */
export function beginBoardPinch(view: BoardViewTransform, points: BoardTouchPoint[]): BoardPinch | null {
  if (points.length < 2) return null;
  const [a, b] = points;
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  if (distance < 1 || !Number.isFinite(distance) || !Number.isFinite(view.scale) || view.scale <= 0) return null;
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  return { ids: [a.id, b.id], distance, scale: view.scale, anchor: { x: (center.x - view.x) / view.scale, y: (center.y - view.y) / view.scale } };
}

/** Keep the captured world point under the moving midpoint, including at the zoom limits. */
export function moveBoardPinch(pinch: BoardPinch, points: BoardTouchPoint[]): BoardViewTransform | null {
  const a = points.find(point => point.id === pinch.ids[0]);
  const b = points.find(point => point.id === pinch.ids[1]);
  if (!a || !b) return null;
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  if (!Number.isFinite(distance)) return null;
  const scale = Math.min(2.2, Math.max(.05, pinch.scale * distance / pinch.distance));
  return { scale, x: (a.x + b.x) / 2 - pinch.anchor.x * scale, y: (a.y + b.y) / 2 - pinch.anchor.y * scale };
}
