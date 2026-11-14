import { GRID, MIN_SIZE, bounds, center } from './geometry';
import { COLORS, SHAPES, type Color, type DiagramEdge, type DiagramNode, type Doc, type Rect, type Selection, type Shape } from './types';

export const emptyDoc: Doc = { version: 1, nodes: [], edges: [] };

let counter = 0;
/** Ids only need to be unique within a document; time + counter avoids collisions across reloads. */
export function newId(prefix: 'n' | 'e'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}`;
}

export const defaultSize: Record<Shape, { w: number; h: number }> = {
  rect: { w: 160, h: 80 },
  ellipse: { w: 160, h: 80 },
  diamond: { w: 160, h: 100 },
  note: { w: 180, h: 100 },
};

export function addNode(doc: Doc, shape: Shape, at: { x: number; y: number }, text = '', id = newId('n')): Doc {
  const { w, h } = defaultSize[shape];
  const node: DiagramNode = { id, shape, text, color: shape === 'note' ? 'amber' : 'slate', x: at.x - w / 2, y: at.y - h / 2, w, h };
  return { ...doc, nodes: [...doc.nodes, node] };
}

export function updateNode(doc: Doc, id: string, patch: Partial<Omit<DiagramNode, 'id'>>): Doc {
  return { ...doc, nodes: doc.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) };
}

export function updateEdge(doc: Doc, id: string, patch: Partial<Pick<DiagramEdge, 'label'>>): Doc {
  return { ...doc, edges: doc.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) };
}

/** Moves nodes to `origin + delta`; taking origins keeps a long drag free of rounding drift. */
export function moveNodes(doc: Doc, origins: Map<string, { x: number; y: number }>, dx: number, dy: number): Doc {
  return {
    ...doc,
    nodes: doc.nodes.map((n) => {
      const origin = origins.get(n.id);
      return origin ? { ...n, x: origin.x + dx, y: origin.y + dy } : n;
    }),
  };
}

export function setRect(doc: Doc, id: string, rect: Rect): Doc {
  return updateNode(doc, id, rect);
}

/** Removes the selection and any connector attached to a removed node. */
export function deleteSelection(doc: Doc, selection: Selection): Doc {
  const nodes = new Set(selection.nodes);
  const edges = new Set(selection.edges);
  return {
    ...doc,
    nodes: doc.nodes.filter((n) => !nodes.has(n.id)),
    edges: doc.edges.filter((e) => !edges.has(e.id) && !nodes.has(e.from) && !nodes.has(e.to)),
  };
}

/** Adds a connector unless it would be a self-loop or duplicate one that exists in either direction. */
export function connect(doc: Doc, from: string, to: string, id = newId('e')): { doc: Doc; edge?: DiagramEdge } {
  if (from === to) return { doc };
  if (!doc.nodes.some((n) => n.id === from) || !doc.nodes.some((n) => n.id === to)) return { doc };
  if (doc.edges.some((e) => (e.from === from && e.to === to) || (e.from === to && e.to === from))) return { doc };
  const edge: DiagramEdge = { id, from, to, label: '' };
  return { doc: { ...doc, edges: [...doc.edges, edge] }, edge };
}

/**
 * Copies nodes (and the connectors between them) offset by one grid step,
 * returning the new ids so the copy can become the selection.
 */
export function duplicate(doc: Doc, nodeIds: string[], offset = GRID): { doc: Doc; ids: string[] } {
  const ids = new Map(nodeIds.map((id) => [id, newId('n')]));
  const copies = doc.nodes
    .filter((n) => ids.has(n.id))
    .map((n) => ({ ...n, id: ids.get(n.id)!, x: n.x + offset, y: n.y + offset }));
  const edges = doc.edges
    .filter((e) => ids.has(e.from) && ids.has(e.to))
    .map((e) => ({ ...e, id: newId('e'), from: ids.get(e.from)!, to: ids.get(e.to)! }));
  return { doc: { ...doc, nodes: [...doc.nodes, ...copies], edges: [...doc.edges, ...edges] }, ids: [...ids.values()] };
}

export type Alignment = 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom';

export function align(doc: Doc, nodeIds: string[], how: Alignment): Doc {
  const chosen = doc.nodes.filter((n) => nodeIds.includes(n.id));
  const box = bounds(chosen);
  if (!box || chosen.length < 2) return doc;
  const place = (n: DiagramNode): Partial<DiagramNode> => {
    switch (how) {
      case 'left':
        return { x: box.x };
      case 'center':
        return { x: box.x + box.w / 2 - n.w / 2 };
      case 'right':
        return { x: box.x + box.w - n.w };
      case 'top':
        return { y: box.y };
      case 'middle':
        return { y: box.y + box.h / 2 - n.h / 2 };
      case 'bottom':
        return { y: box.y + box.h - n.h };
    }
  };
  return { ...doc, nodes: doc.nodes.map((n) => (nodeIds.includes(n.id) ? { ...n, ...place(n) } : n)) };
}

/** Spaces the selected nodes so the gaps between their centres are equal; the outermost two stay put. */
export function distribute(doc: Doc, nodeIds: string[], axis: 'x' | 'y'): Doc {
  const chosen = doc.nodes.filter((n) => nodeIds.includes(n.id));
  if (chosen.length < 3) return doc;
  const size = axis === 'x' ? 'w' : 'h';
  const sorted = [...chosen].sort((a, b) => center(a)[axis] - center(b)[axis]);
  const first = center(sorted[0])[axis];
  const step = (center(sorted[sorted.length - 1])[axis] - first) / (sorted.length - 1);
  const target = new Map(sorted.map((n, i) => [n.id, first + step * i - n[size] / 2]));
  return { ...doc, nodes: doc.nodes.map((n) => (target.has(n.id) ? { ...n, [axis]: target.get(n.id)! } : n)) };
}

export function bringToFront(doc: Doc, nodeIds: string[]): Doc {
  const moving = doc.nodes.filter((n) => nodeIds.includes(n.id));
  return { ...doc, nodes: [...doc.nodes.filter((n) => !nodeIds.includes(n.id)), ...moving] };
}

// --- Validation -------------------------------------------------------------

export class DocError extends Error {}

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isString = (v: unknown): v is string => typeof v === 'string';

/**
 * Turns untrusted JSON (an imported file or old localStorage) into a Doc,
 * or throws a DocError saying what is wrong. Unknown fields are dropped.
 */
export function parseDoc(input: unknown): Doc {
  if (!input || typeof input !== 'object') throw new DocError('The file is not a diagram.');
  const raw = input as Record<string, unknown>;
  if (raw.version !== 1) throw new DocError('Unsupported diagram version.');
  if (!Array.isArray(raw.nodes) || !Array.isArray(raw.edges)) throw new DocError('The diagram has no nodes or edges list.');
  if (raw.nodes.length > 5000) throw new DocError('The diagram has more than 5,000 shapes.');

  const ids = new Set<string>();
  const nodes = raw.nodes.map((value, index): DiagramNode => {
    const n = value as Record<string, unknown>;
    const where = `Shape ${index + 1}`;
    if (!n || !isString(n.id) || !n.id) throw new DocError(`${where} has no id.`);
    if (ids.has(n.id)) throw new DocError(`${where} repeats the id "${n.id}".`);
    ids.add(n.id);
    if (![n.x, n.y, n.w, n.h].every(isFiniteNumber)) throw new DocError(`${where} has an invalid position or size.`);
    return {
      id: n.id,
      shape: SHAPES.includes(n.shape as Shape) ? (n.shape as Shape) : 'rect',
      text: isString(n.text) ? n.text.slice(0, 500) : '',
      color: COLORS.includes(n.color as Color) ? (n.color as Color) : 'slate',
      x: n.x as number,
      y: n.y as number,
      w: Math.max(MIN_SIZE, n.w as number),
      h: Math.max(MIN_SIZE, n.h as number),
    };
  });

  const edgeIds = new Set<string>();
  const edges = raw.edges.flatMap((value, index): DiagramEdge[] => {
    const e = value as Record<string, unknown>;
    const where = `Connector ${index + 1}`;
    if (!e || !isString(e.id) || !e.id || edgeIds.has(e.id)) throw new DocError(`${where} has a missing or repeated id.`);
    edgeIds.add(e.id);
    if (!isString(e.from) || !isString(e.to) || !ids.has(e.from) || !ids.has(e.to)) {
      throw new DocError(`${where} points to a shape that does not exist.`);
    }
    if (e.from === e.to) return [];
    return [{ id: e.id, from: e.from, to: e.to, label: isString(e.label) ? e.label.slice(0, 200) : '' }];
  });

  return { version: 1, nodes, edges };
}

// --- Starter diagram ---------------------------------------------------------

export function sampleDoc(): Doc {
  const node = (id: string, shape: Shape, text: string, x: number, y: number, color: Color = 'slate'): DiagramNode => ({
    id,
    shape,
    text,
    color,
    x,
    y,
    ...defaultSize[shape],
  });
  return {
    version: 1,
    nodes: [
      node('start', 'ellipse', 'Order received', 40, 160, 'blue'),
      node('stock', 'diamond', 'In stock?', 280, 150),
      node('pack', 'rect', 'Pick and pack', 520, 60),
      node('ship', 'rect', 'Ship with tracking', 760, 60, 'green'),
      node('backorder', 'rect', 'Create back-order', 520, 260, 'rose'),
      node('notify', 'rect', 'Email expected date', 760, 260),
      node('memo', 'note', 'Back-orders older than 14 days are reviewed every Monday.', 520, 400),
    ],
    edges: [
      { id: 'e1', from: 'start', to: 'stock', label: '' },
      { id: 'e2', from: 'stock', to: 'pack', label: 'yes' },
      { id: 'e3', from: 'pack', to: 'ship', label: '' },
      { id: 'e4', from: 'stock', to: 'backorder', label: 'no' },
      { id: 'e5', from: 'backorder', to: 'notify', label: '' },
    ],
  };
}
