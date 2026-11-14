import { connector } from './geometry';
import type { Color, DiagramNode, Doc, Point } from './types';

/** Geometry shared by the live canvas and the exported SVG, so the two cannot drift apart. */
export type ShapeGeometry =
  | { kind: 'rect'; x: number; y: number; w: number; h: number; r: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'path'; d: string };

export function shapeGeometry(node: DiagramNode): ShapeGeometry {
  const { x, y, w, h } = node;
  switch (node.shape) {
    case 'rect':
      return { kind: 'rect', x, y, w, h, r: 8 };
    case 'ellipse':
      return { kind: 'ellipse', cx: x + w / 2, cy: y + h / 2, rx: w / 2, ry: h / 2 };
    case 'diamond':
      return { kind: 'path', d: `M${x + w / 2} ${y}L${x + w} ${y + h / 2}L${x + w / 2} ${y + h}L${x} ${y + h / 2}Z` };
    case 'note': {
      const fold = Math.min(18, w / 4, h / 4);
      return { kind: 'path', d: `M${x} ${y}H${x + w - fold}L${x + w} ${y + fold}V${y + h}H${x}Z` };
    }
  }
}

/** Light palette used for export; the app maps the same names to theme-aware CSS variables. */
export const exportPalette: Record<Color, { fill: string; stroke: string }> = {
  slate: { fill: '#ffffff', stroke: '#4b5363' },
  blue: { fill: '#e6edff', stroke: '#3056c9' },
  green: { fill: '#e2f5e9', stroke: '#23854d' },
  amber: { fill: '#fdf1d2', stroke: '#a26a00' },
  rose: { fill: '#fde7ea', stroke: '#b9314f' },
  violet: { fill: '#efe7fd', stroke: '#6c43c4' },
};

export const FONT_SIZE = 14;
export const LINE_HEIGHT = 18;
export const FONT_FAMILY = "Inter, ui-sans-serif, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";

let measureContext: CanvasRenderingContext2D | null | undefined;

export function measureText(text: string): number {
  if (measureContext === undefined) {
    try {
      measureContext = document.createElement('canvas').getContext('2d');
      if (measureContext) measureContext.font = `${FONT_SIZE}px ${FONT_FAMILY}`;
    } catch {
      measureContext = null;
    }
  }
  // jsdom has no canvas; an average glyph width keeps tests deterministic.
  return measureContext ? measureContext.measureText(text).width : text.length * FONT_SIZE * 0.55;
}

/**
 * Greedy word wrap into lines no wider than `width`. Explicit newlines are
 * kept, long words are broken, and output beyond `maxLines` ends in "…".
 */
export function wrapText(text: string, width: number, maxLines = Infinity): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      let rest = word;
      while (measureText(rest) > width && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && measureText(rest.slice(0, cut)) > width) cut--;
        if (line) {
          lines.push(line);
          line = '';
        }
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      const candidate = line ? `${line} ${rest}` : rest;
      if (measureText(candidate) <= width) line = candidate;
      else {
        lines.push(line);
        line = rest;
      }
    }
    lines.push(line);
  }
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1].replace(/\s*\S?$/, '')}…`;
    return kept;
  }
  return lines;
}

/** Usable text box inside each shape (a diamond only has room in its middle). */
export function textBox(node: DiagramNode): { width: number; maxLines: number } {
  const inset = node.shape === 'diamond' ? 0.5 : node.shape === 'ellipse' ? 0.72 : 1;
  const width = Math.max(10, node.w * inset - 20);
  const height = Math.max(LINE_HEIGHT, node.h * (node.shape === 'diamond' ? 0.55 : 1) - 16);
  return { width, maxLines: Math.max(1, Math.floor(height / LINE_HEIGHT)) };
}

export function textLines(node: DiagramNode): string[] {
  const { width, maxLines } = textBox(node);
  return wrapText(node.text, width, maxLines);
}

export type EdgeGeometry = { start: Point; end: Point; mid: Point };

export function edgeGeometry(doc: Doc, from: string, to: string): EdgeGeometry | null {
  const a = doc.nodes.find((n) => n.id === from);
  const b = doc.nodes.find((n) => n.id === to);
  if (!a || !b) return null;
  const { start, end } = connector(a, b);
  return { start, end, mid: { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 } };
}
