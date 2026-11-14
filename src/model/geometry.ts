import type { DiagramNode, Point, Rect, Viewport } from './types';

export const GRID = 20;
export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 4;
export const MIN_SIZE = 40;

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function snap(value: number, step = GRID): number {
  return Math.round(value / step) * step;
}

export function center(rect: Rect): Point {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/** Rectangle spanned by two corner points, in any order. */
export function rectFromPoints(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

export function contains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

export function bounds(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  const x1 = Math.min(...rects.map((r) => r.x));
  const y1 = Math.min(...rects.map((r) => r.y));
  const x2 = Math.max(...rects.map((r) => r.x + r.w));
  const y2 = Math.max(...rects.map((r) => r.y + r.h));
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function screenToWorld(point: Point, view: Viewport): Point {
  return { x: (point.x - view.x) / view.zoom, y: (point.y - view.y) / view.zoom };
}

export function worldToScreen(point: Point, view: Viewport): Point {
  return { x: point.x * view.zoom + view.x, y: point.y * view.zoom + view.y };
}

/** Zooms by `factor` while keeping the world point under `anchor` (screen coords) fixed. */
export function zoomAt(view: Viewport, anchor: Point, factor: number): Viewport {
  const zoom = clamp(view.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const world = screenToWorld(anchor, view);
  return { zoom, x: anchor.x - world.x * zoom, y: anchor.y - world.y * zoom };
}

/** Viewport that fits `content` inside a `width` x `height` screen with padding, never above 100 %. */
export function fitView(content: Rect | null, width: number, height: number, padding = 48): Viewport {
  if (!content || width <= 0 || height <= 0) return { x: 0, y: 0, zoom: 1 };
  const zoom = clamp(
    Math.min((width - padding * 2) / Math.max(content.w, 1), (height - padding * 2) / Math.max(content.h, 1), 1),
    MIN_ZOOM,
    MAX_ZOOM,
  );
  return {
    zoom,
    x: (width - content.w * zoom) / 2 - content.x * zoom,
    y: (height - content.h * zoom) / 2 - content.y * zoom,
  };
}

/**
 * Point where the ray from the node's centre towards `toward` leaves the
 * node's outline, so connectors start and end on the visible shape.
 */
export function boundaryPoint(node: DiagramNode, toward: Point): Point {
  const c = center(node);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const a = node.w / 2;
  const b = node.h / 2;
  let t: number;
  switch (node.shape) {
    case 'ellipse':
      t = 1 / Math.sqrt((dx * dx) / (a * a) + (dy * dy) / (b * b));
      break;
    case 'diamond':
      t = 1 / (Math.abs(dx) / a + Math.abs(dy) / b);
      break;
    default:
      t = Math.min(dx === 0 ? Infinity : a / Math.abs(dx), dy === 0 ? Infinity : b / Math.abs(dy));
  }
  return { x: c.x + dx * t, y: c.y + dy * t };
}

/** Straight connector between two nodes, clipped to both outlines. */
export function connector(from: DiagramNode, to: DiagramNode): { start: Point; end: Point } {
  return { start: boundaryPoint(from, center(to)), end: boundaryPoint(to, center(from)) };
}

export type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
export const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export function handlePosition(rect: Rect, handle: Handle): Point {
  const x = handle.includes('w') ? rect.x : handle.includes('e') ? rect.x + rect.w : rect.x + rect.w / 2;
  const y = handle.includes('n') ? rect.y : handle.includes('s') ? rect.y + rect.h : rect.y + rect.h / 2;
  return { x, y };
}

/**
 * Resizes `start` by dragging `handle` by (dx, dy). The opposite edge stays
 * put, the size never drops below MIN_SIZE, and `keepRatio` preserves the
 * original aspect ratio for corner handles.
 */
export function resize(start: Rect, handle: Handle, dx: number, dy: number, keepRatio = false): Rect {
  let { x, y, w, h } = start;
  if (handle.includes('e')) w = start.w + dx;
  if (handle.includes('w')) w = start.w - dx;
  if (handle.includes('s')) h = start.h + dy;
  if (handle.includes('n')) h = start.h - dy;
  w = Math.max(MIN_SIZE, w);
  h = Math.max(MIN_SIZE, h);
  if (keepRatio && handle.length === 2) {
    const ratio = start.w / start.h;
    if (w / h > ratio) h = w / ratio;
    else w = h * ratio;
  }
  if (handle.includes('w')) x = start.x + start.w - w;
  if (handle.includes('n')) y = start.y + start.h - h;
  return { x, y, w, h };
}
