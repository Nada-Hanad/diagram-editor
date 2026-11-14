import { describe, expect, it } from 'vitest';
import {
  DocError,
  addNode,
  align,
  connect,
  deleteSelection,
  distribute,
  duplicate,
  emptyDoc,
  parseDoc,
  sampleDoc,
} from '../../src/model/doc';
import { COALESCE_MS, commit, createHistory, redo, seal, undo } from '../../src/model/history';
import { toSvg } from '../../src/model/export';
import { wrapText } from '../../src/model/render';
import type { Doc } from '../../src/model/types';

const three = (): Doc => {
  let doc = addNode(emptyDoc, 'rect', { x: 100, y: 100 }, 'A', 'a');
  doc = addNode(doc, 'rect', { x: 400, y: 160 }, 'B', 'b');
  doc = addNode(doc, 'ellipse', { x: 220, y: 300 }, 'C', 'c');
  return doc;
};

describe('connect', () => {
  it('refuses self-loops, missing nodes and duplicates in either direction', () => {
    const doc = three();
    const { doc: withEdge, edge } = connect(doc, 'a', 'b', 'e1');
    expect(edge).toMatchObject({ from: 'a', to: 'b' });
    expect(connect(withEdge, 'a', 'b').edge).toBeUndefined();
    expect(connect(withEdge, 'b', 'a').edge).toBeUndefined();
    expect(connect(doc, 'a', 'a').edge).toBeUndefined();
    expect(connect(doc, 'a', 'zzz').edge).toBeUndefined();
  });
});

describe('deleteSelection', () => {
  it('removes connectors attached to deleted shapes', () => {
    let doc = connect(three(), 'a', 'b', 'e1').doc;
    doc = connect(doc, 'b', 'c', 'e2').doc;
    const next = deleteSelection(doc, { nodes: ['b'], edges: [] });
    expect(next.nodes.map((n) => n.id)).toEqual(['a', 'c']);
    expect(next.edges).toEqual([]);
  });
});

describe('duplicate', () => {
  it('copies shapes and only the connectors between copied shapes', () => {
    let doc = connect(three(), 'a', 'b', 'e1').doc;
    doc = connect(doc, 'b', 'c', 'e2').doc;
    const { doc: next, ids } = duplicate(doc, ['a', 'b']);
    expect(ids).toHaveLength(2);
    expect(next.nodes).toHaveLength(5);
    const copiedEdges = next.edges.filter((e) => ids.includes(e.from) || ids.includes(e.to));
    expect(copiedEdges).toHaveLength(1);
    expect(ids).toContain(copiedEdges[0].from);
    expect(ids).toContain(copiedEdges[0].to);
  });
});

describe('align and distribute', () => {
  it('aligns left edges to the leftmost shape', () => {
    const doc = align(three(), ['a', 'b', 'c'], 'left');
    expect(new Set(doc.nodes.map((n) => n.x))).toEqual(new Set([20]));
  });

  it('spaces centres evenly and leaves the outermost shapes in place', () => {
    const doc = distribute(three(), ['a', 'b', 'c'], 'x');
    const centres = doc.nodes.map((n) => n.x + n.w / 2).sort((p, q) => p - q);
    expect(centres).toEqual([100, 250, 400]);
  });

  it('needs at least three shapes to distribute', () => {
    const doc = three();
    expect(distribute(doc, ['a', 'b'], 'x')).toBe(doc);
  });
});

describe('history', () => {
  it('undoes and redoes whole steps', () => {
    let h = createHistory(emptyDoc);
    h = commit(h, three());
    h = commit(h, deleteSelection(h.present, { nodes: ['a'], edges: [] }));
    h = undo(h);
    expect(h.present.nodes).toHaveLength(3);
    h = redo(h);
    expect(h.present.nodes).toHaveLength(2);
    h = undo(undo(h));
    expect(h.present).toEqual(emptyDoc);
    expect(undo(h)).toBe(h);
  });

  it('merges a stream of keyed commits into one step', () => {
    let h = commit(createHistory(emptyDoc), three(), null, 0);
    for (let i = 1; i <= 30; i++) {
      h = commit(h, { ...h.present, nodes: h.present.nodes.map((n) => ({ ...n, x: n.x + 1 })) }, 'move:1', i * 16);
    }
    expect(h.past).toHaveLength(2);
    h = undo(h);
    expect(h.present.nodes[0].x).toBe(three().nodes[0].x);
  });

  it('starts a new step after a pause, a different key or a seal', () => {
    let h = commit(createHistory(emptyDoc), three(), 'nudge', 0);
    h = commit(h, { ...h.present }, 'nudge', COALESCE_MS + 1);
    expect(h.past).toHaveLength(2);
    h = commit(seal(h), { ...h.present }, 'nudge', COALESCE_MS + 2);
    expect(h.past).toHaveLength(3);
  });

  it('drops the redo stack after a new edit', () => {
    let h = commit(createHistory(emptyDoc), three());
    h = undo(h);
    h = commit(h, addNode(h.present, 'note', { x: 0, y: 0 }));
    expect(h.future).toEqual([]);
  });
});

describe('parseDoc', () => {
  it('accepts its own output', () => {
    const doc = sampleDoc();
    expect(parseDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });

  it.each([
    ['not an object', 'hello', 'The file is not a diagram.'],
    ['wrong version', { version: 2, nodes: [], edges: [] }, 'Unsupported diagram version.'],
    ['bad size', { version: 1, nodes: [{ id: 'a', x: 0, y: 0, w: 'big', h: 10 }], edges: [] }, 'Shape 1 has an invalid position or size.'],
    ['repeated id', { version: 1, nodes: [{ id: 'a', x: 0, y: 0, w: 50, h: 50 }, { id: 'a', x: 0, y: 0, w: 50, h: 50 }], edges: [] }, 'Shape 2 repeats the id "a".'],
    ['dangling edge', { version: 1, nodes: [{ id: 'a', x: 0, y: 0, w: 50, h: 50 }], edges: [{ id: 'e', from: 'a', to: 'b' }] }, 'Connector 1 points to a shape that does not exist.'],
  ])('rejects %s with a readable reason', (_label, input, message) => {
    expect(() => parseDoc(input)).toThrow(new DocError(message));
  });

  it('repairs what it safely can: unknown shapes, colours, tiny sizes and self-loops', () => {
    const doc = parseDoc({
      version: 1,
      nodes: [{ id: 'a', shape: 'hexagon', color: 'neon', x: 0, y: 0, w: 5, h: 5, text: 7, extra: true }],
      edges: [{ id: 'e', from: 'a', to: 'a' }],
    });
    expect(doc.nodes[0]).toEqual({ id: 'a', shape: 'rect', color: 'slate', x: 0, y: 0, w: 40, h: 40, text: '' });
    expect(doc.edges).toEqual([]);
  });
});

describe('wrapText', () => {
  it('wraps on words, keeps explicit newlines and truncates with an ellipsis', () => {
    const lines = wrapText('one two three four five six seven eight', 80);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe('one two three four five six seven eight');
    expect(wrapText('a\nb', 500)).toEqual(['a', 'b']);
    const cut = wrapText('one two three four five six seven eight', 80, 2);
    expect(cut).toHaveLength(2);
    expect(cut[1].endsWith('…')).toBe(true);
  });

  it('breaks a word that is wider than the box', () => {
    const lines = wrapText('supercalifragilisticexpialidocious', 60);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join('')).toBe('supercalifragilisticexpialidocious');
  });
});

describe('toSvg', () => {
  it('produces a standalone SVG cropped to the content with escaped text', () => {
    const doc = addNode(emptyDoc, 'rect', { x: 100, y: 100 }, 'Tom & <Jerry>', 'a');
    const svg = toSvg(doc);
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="-12 28 224 144"')).toBe(true);
    expect(svg).toContain('Tom &amp; &lt;Jerry&gt;');
    expect(new DOMParser().parseFromString(svg, 'image/svg+xml').querySelector('parsererror')).toBeNull();
  });
});
