import { describe, expect, it } from 'vitest';
import {
  MAX_ZOOM,
  MIN_SIZE,
  MIN_ZOOM,
  boundaryPoint,
  bounds,
  fitView,
  intersects,
  rectFromPoints,
  resize,
  screenToWorld,
  snap,
  worldToScreen,
  zoomAt,
} from '../../src/model/geometry';
import type { DiagramNode, Shape } from '../../src/model/types';

const node = (shape: Shape, x = 0, y = 0, w = 100, h = 60): DiagramNode => ({ id: 'n', shape, text: '', color: 'slate', x, y, w, h });

describe('coordinates', () => {
  it('converts screen to world and back', () => {
    const view = { x: 120, y: -40, zoom: 1.5 };
    const p = { x: 37, y: 91 };
    const back = worldToScreen(screenToWorld(p, view), view);
    expect(back.x).toBeCloseTo(p.x);
    expect(back.y).toBeCloseTo(p.y);
  });

  it('keeps the world point under the cursor fixed when zooming', () => {
    const view = { x: 30, y: 20, zoom: 1 };
    const anchor = { x: 400, y: 250 };
    const before = screenToWorld(anchor, view);
    const after = screenToWorld(anchor, zoomAt(view, anchor, 2.5));
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });

  it('clamps zoom to its limits', () => {
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 100).zoom).toBe(MAX_ZOOM);
    expect(zoomAt({ x: 0, y: 0, zoom: 1 }, { x: 0, y: 0 }, 0.001).zoom).toBe(MIN_ZOOM);
  });
});

describe('fitView', () => {
  it('centres the content and never zooms past 100 %', () => {
    const view = fitView({ x: 100, y: 100, w: 200, h: 100 }, 1000, 800);
    expect(view.zoom).toBe(1);
    const c = worldToScreen({ x: 200, y: 150 }, view);
    expect(c).toEqual({ x: 500, y: 400 });
  });

  it('shrinks large content to fit inside the padding', () => {
    const view = fitView({ x: 0, y: 0, w: 2000, h: 500 }, 1000, 800, 50);
    expect(view.zoom).toBeCloseTo(0.45);
    expect(worldToScreen({ x: 0, y: 0 }, view).x).toBeCloseTo(50);
  });

  it('returns the identity view for an empty diagram', () => {
    expect(fitView(null, 800, 600)).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});

describe('boundaryPoint', () => {
  it('lands on the edge of a rectangle', () => {
    expect(boundaryPoint(node('rect'), { x: 500, y: 30 })).toEqual({ x: 100, y: 30 });
    expect(boundaryPoint(node('rect'), { x: 50, y: -500 })).toEqual({ x: 50, y: 0 });
  });

  it('lands on the ellipse outline', () => {
    const p = boundaryPoint(node('ellipse'), { x: 200, y: 130 });
    // (x - cx)^2 / a^2 + (y - cy)^2 / b^2 = 1 on the outline.
    expect(((p.x - 50) / 50) ** 2 + ((p.y - 30) / 30) ** 2).toBeCloseTo(1);
  });

  it('lands on the diamond outline', () => {
    const p = boundaryPoint(node('diamond'), { x: 300, y: 230 });
    expect(Math.abs(p.x - 50) / 50 + Math.abs(p.y - 30) / 30).toBeCloseTo(1);
    expect(boundaryPoint(node('diamond'), { x: 500, y: 30 })).toEqual({ x: 100, y: 30 });
  });

  it('returns the centre when the target is the centre', () => {
    expect(boundaryPoint(node('rect'), { x: 50, y: 30 })).toEqual({ x: 50, y: 30 });
  });
});

describe('resize', () => {
  const start = { x: 100, y: 100, w: 200, h: 100 };

  it('keeps the opposite edge fixed', () => {
    expect(resize(start, 'nw', 50, 20)).toEqual({ x: 150, y: 120, w: 150, h: 80 });
    expect(resize(start, 'e', 30, 999)).toEqual({ x: 100, y: 100, w: 230, h: 100 });
  });

  it('never shrinks below the minimum size, even past the opposite edge', () => {
    const r = resize(start, 'w', 500, 0);
    expect(r.w).toBe(MIN_SIZE);
    expect(r.x + r.w).toBe(300);
  });

  it('keeps the aspect ratio on corner handles when asked', () => {
    const r = resize(start, 'se', 100, 0, true);
    expect(r.w / r.h).toBeCloseTo(2);
  });
});

describe('rect helpers', () => {
  it('normalises corner order and detects overlap', () => {
    expect(rectFromPoints({ x: 10, y: 50 }, { x: 0, y: 20 })).toEqual({ x: 0, y: 20, w: 10, h: 30 });
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 10, w: 5, h: 5 })).toBe(true);
    expect(intersects({ x: 0, y: 0, w: 10, h: 10 }, { x: 11, y: 0, w: 5, h: 5 })).toBe(false);
  });

  it('computes bounds and snaps to the grid', () => {
    expect(bounds([{ x: 0, y: 5, w: 10, h: 10 }, { x: -5, y: 0, w: 2, h: 2 }])).toEqual({ x: -5, y: 0, w: 15, h: 15 });
    expect(bounds([])).toBeNull();
    expect(snap(29)).toBe(20);
    expect(snap(31)).toBe(40);
  });
});
