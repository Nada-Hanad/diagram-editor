import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addNode,
  align,
  bringToFront,
  connect,
  deleteSelection,
  distribute,
  duplicate,
  emptyDoc,
  moveNodes,
  newId,
  parseDoc,
  sampleDoc,
  updateEdge,
  updateNode,
  type Alignment,
} from '../model/doc';
import { download, svgToPng, toJson, toSvg } from '../model/export';
import { GRID, bounds, fitView, screenToWorld, zoomAt } from '../model/geometry';
import { commit, createHistory, redo, seal, undo, type History } from '../model/history';
import { loadDoc, saveDoc } from '../model/storage';
import { emptySelection, shapeLabel, type Color, type DiagramNode, type Doc, type Point, type Selection, type Shape, type Viewport } from '../model/types';

type Clipboard = { nodes: DiagramNode[]; edges: Doc['edges'] } | null;

export type Editor = ReturnType<typeof useEditor>;

const describeNode = (node: DiagramNode) => `${shapeLabel[node.shape]}${node.text ? ` “${node.text}”` : ''}`;

export function useEditor() {
  const [history, setHistory] = useState<History>(() => createHistory(loadDoc()));
  const [rawSelection, setSelection] = useState<Selection>(emptySelection);
  const [view, setView] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [editing, setEditing] = useState<{ kind: 'node' | 'edge'; id: string } | null>(null);
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [snapToGrid, setSnapToGrid] = useState(true);
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'error'; at: number } | null>(null);
  const clipboard = useRef<Clipboard>(null);
  const viewportSize = useRef({ width: 0, height: 0 });

  const doc = history.present;

  // Ids that no longer exist (after undo, delete or import) are dropped here
  // rather than in an effect, so no render ever sees a stale selection.
  const selection = useMemo<Selection>(() => {
    const nodes = rawSelection.nodes.filter((id) => doc.nodes.some((n) => n.id === id));
    const edges = rawSelection.edges.filter((id) => doc.edges.some((e) => e.id === id));
    return nodes.length === rawSelection.nodes.length && edges.length === rawSelection.edges.length ? rawSelection : { nodes, edges };
  }, [rawSelection, doc]);

  useEffect(() => {
    saveDoc(doc);
  }, [doc]);

  const announce = useCallback((text: string, tone: 'info' | 'error' = 'info') => {
    setMessage({ text, tone, at: Date.now() });
  }, []);

  const change = useCallback((next: Doc | ((current: Doc) => Doc), key: string | null = null) => {
    setHistory((h) => commit(h, typeof next === 'function' ? next(h.present) : next, key));
  }, []);

  const endGesture = useCallback(() => setHistory(seal), []);

  // --- View ----------------------------------------------------------------

  const setViewportSize = useCallback((width: number, height: number) => {
    viewportSize.current = { width, height };
  }, []);

  const fit = useCallback((target: Doc = doc) => {
    const { width, height } = viewportSize.current;
    setView(fitView(bounds(target.nodes), width, height));
  }, [doc]);

  const zoomBy = useCallback((factor: number, anchor?: Point) => {
    const { width, height } = viewportSize.current;
    setView((v) => zoomAt(v, anchor ?? { x: width / 2, y: height / 2 }, factor));
  }, []);

  const resetZoom = useCallback(() => {
    const { width, height } = viewportSize.current;
    setView((v) => zoomAt(v, { x: width / 2, y: height / 2 }, 1 / v.zoom));
  }, []);

  const viewCenter = useCallback((): Point => {
    const { width, height } = viewportSize.current;
    return screenToWorld({ x: width / 2, y: height / 2 }, view);
  }, [view]);

  // --- Selection -------------------------------------------------------------

  const selectOnly = useCallback((sel: Partial<Selection>) => {
    setSelection({ nodes: sel.nodes ?? [], edges: sel.edges ?? [] });
  }, []);

  const selectAll = useCallback(() => {
    setSelection({ nodes: doc.nodes.map((n) => n.id), edges: doc.edges.map((e) => e.id) });
    announce(`Selected ${doc.nodes.length} shapes and ${doc.edges.length} connectors.`);
  }, [doc, announce]);

  const clearSelection = useCallback(() => setSelection(emptySelection), []);


  // --- Editing ---------------------------------------------------------------

  const addShape = useCallback(
    (shape: Shape, at?: Point, options: { edit?: boolean } = {}) => {
      const point = at ?? viewCenter();
      const snapped = snapToGrid ? { x: Math.round(point.x / GRID) * GRID, y: Math.round(point.y / GRID) * GRID } : point;
      const id = newId('n');
      change((current) => addNode(current, shape, snapped, '', id));
      selectOnly({ nodes: [id] });
      if (options.edit) setEditing({ kind: 'node', id });
      announce(`Added ${shapeLabel[shape].toLowerCase()}.`);
      return id;
    },
    [change, selectOnly, announce, viewCenter, snapToGrid],
  );

  const deleteSelected = useCallback(() => {
    if (!selection.nodes.length && !selection.edges.length) return;
    change((current) => deleteSelection(current, selection));
    announce(`Deleted ${selection.nodes.length} shapes and ${selection.edges.length} connectors.`);
    clearSelection();
  }, [selection, change, announce, clearSelection]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!selection.nodes.length) return;
      const origins = new Map(doc.nodes.filter((n) => selection.nodes.includes(n.id)).map((n) => [n.id, { x: n.x, y: n.y }]));
      change(moveNodes(doc, origins, dx, dy), `nudge:${selection.nodes.join(',')}`);
    },
    [doc, selection, change],
  );

  const duplicateSelected = useCallback(() => {
    if (!selection.nodes.length) return;
    const result = duplicate(doc, selection.nodes);
    change(result.doc);
    selectOnly({ nodes: result.ids });
    announce(`Duplicated ${result.ids.length} shapes.`);
  }, [doc, selection, change, selectOnly, announce]);

  const copy = useCallback(() => {
    const nodes = doc.nodes.filter((n) => selection.nodes.includes(n.id));
    if (!nodes.length) return;
    const ids = new Set(nodes.map((n) => n.id));
    clipboard.current = { nodes, edges: doc.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) };
    announce(`Copied ${nodes.length} shapes.`);
  }, [doc, selection, announce]);

  const paste = useCallback(() => {
    const clip = clipboard.current;
    if (!clip) return;
    // Paste the clipboard's own nodes (they may have been deleted since copying).
    const staging: Doc = { version: 1, nodes: clip.nodes, edges: clip.edges };
    const result = duplicate(staging, clip.nodes.map((n) => n.id), GRID * 2);
    const pasted = result.doc.nodes.filter((n) => result.ids.includes(n.id));
    const pastedIds = new Set(result.ids);
    change((current) => ({
      ...current,
      nodes: [...current.nodes, ...pasted],
      edges: [...current.edges, ...result.doc.edges.filter((e) => pastedIds.has(e.from))],
    }));
    clipboard.current = { nodes: pasted, edges: result.doc.edges.filter((e) => pastedIds.has(e.from)) };
    selectOnly({ nodes: result.ids });
    announce(`Pasted ${pasted.length} shapes.`);
  }, [change, selectOnly, announce]);

  const cut = useCallback(() => {
    copy();
    deleteSelected();
  }, [copy, deleteSelected]);

  const setText = useCallback(
    (id: string, text: string) => {
      const node = doc.nodes.find((n) => n.id === id);
      if (node && node.text !== text) change(updateNode(doc, id, { text }));
    },
    [doc, change],
  );

  const setEdgeLabel = useCallback(
    (id: string, label: string) => {
      const edge = doc.edges.find((e) => e.id === id);
      if (edge && edge.label !== label) change(updateEdge(doc, id, { label }));
    },
    [doc, change],
  );

  const patchSelectedNodes = useCallback(
    (patch: Partial<Pick<DiagramNode, 'color' | 'shape' | 'x' | 'y' | 'w' | 'h'>>, key: string | null = null) => {
      change(
        (current) => ({
          ...current,
          nodes: current.nodes.map((n) => (selection.nodes.includes(n.id) ? { ...n, ...patch } : n)),
        }),
        key,
      );
    },
    [selection, change],
  );

  const setColor = useCallback((color: Color) => patchSelectedNodes({ color }), [patchSelectedNodes]);

  const alignSelected = useCallback(
    (how: Alignment) => {
      change(align(doc, selection.nodes, how));
      announce(`Aligned ${selection.nodes.length} shapes (${how}).`);
    },
    [doc, selection, change, announce],
  );

  const distributeSelected = useCallback(
    (axis: 'x' | 'y') => {
      change(distribute(doc, selection.nodes, axis));
      announce(`Distributed ${selection.nodes.length} shapes ${axis === 'x' ? 'horizontally' : 'vertically'}.`);
    },
    [doc, selection, change, announce],
  );

  const toFront = useCallback(() => change(bringToFront(doc, selection.nodes)), [doc, selection, change]);

  const reverseEdge = useCallback(
    (id: string) => change((current) => ({ ...current, edges: current.edges.map((e) => (e.id === id ? { ...e, from: e.to, to: e.from } : e)) })),
    [change],
  );

  // --- Connecting ------------------------------------------------------------

  const connectNodes = useCallback(
    (from: string, to: string) => {
      const result = connect(doc, from, to);
      if (!result.edge) {
        announce(from === to ? 'A shape cannot connect to itself.' : 'Those shapes are already connected.', 'error');
        return false;
      }
      change(result.doc);
      selectOnly({ edges: [result.edge.id] });
      const a = doc.nodes.find((n) => n.id === from)!;
      const b = doc.nodes.find((n) => n.id === to)!;
      announce(`Connected ${describeNode(a)} to ${describeNode(b)}.`);
      return true;
    },
    [doc, change, selectOnly, announce],
  );

  const startConnect = useCallback(() => {
    if (selection.nodes.length !== 1) {
      announce('Select one shape to connect from.', 'error');
      return;
    }
    const node = doc.nodes.find((n) => n.id === selection.nodes[0])!;
    setConnectFrom(node.id);
    announce(`Connecting from ${describeNode(node)}. Tab to another shape and press Enter, or Escape to cancel.`);
  }, [doc, selection, announce]);

  const cancelConnect = useCallback(() => {
    if (connectFrom) announce('Connection cancelled.');
    setConnectFrom(null);
  }, [connectFrom, announce]);

  // --- History ---------------------------------------------------------------

  const doUndo = useCallback(() => {
    if (!history.past.length) return;
    setHistory(undo);
    announce('Undone.');
  }, [history.past.length, announce]);

  const doRedo = useCallback(() => {
    if (!history.future.length) return;
    setHistory(redo);
    announce('Redone.');
  }, [history.future.length, announce]);

  // --- Files -----------------------------------------------------------------

  const importText = useCallback(
    (text: string) => {
      try {
        const next = parseDoc(JSON.parse(text));
        change(next);
        clearSelection();
        fit(next);
        announce(`Imported ${next.nodes.length} shapes and ${next.edges.length} connectors.`);
      } catch (error) {
        const reason = error instanceof SyntaxError ? 'The file is not valid JSON.' : (error as Error).message;
        announce(`Import failed. ${reason}`, 'error');
      }
    },
    [change, clearSelection, fit, announce],
  );

  const newDiagram = useCallback(() => {
    change(emptyDoc);
    clearSelection();
    setView({ x: 0, y: 0, zoom: 1 });
    announce('Started a new diagram. Undo brings the previous one back.');
  }, [change, clearSelection, announce]);

  const loadSample = useCallback(() => {
    const next = sampleDoc();
    change(next);
    clearSelection();
    fit(next);
    announce('Loaded the example diagram.');
  }, [change, clearSelection, fit, announce]);

  const exportAs = useCallback(
    async (format: 'svg' | 'png' | 'json') => {
      if (format === 'json') return download(toJson(doc), 'diagram.json', 'application/json');
      if (!doc.nodes.length) return announce('Nothing to export yet.', 'error');
      const svg = toSvg(doc);
      if (format === 'svg') return download(svg, 'diagram.svg', 'image/svg+xml');
      try {
        download(await svgToPng(svg), 'diagram.png');
      } catch (error) {
        announce(`PNG export failed. ${(error as Error).message}`, 'error');
      }
    },
    [doc, announce],
  );

  const selectedNodes = useMemo(() => doc.nodes.filter((n) => selection.nodes.includes(n.id)), [doc, selection.nodes]);

  return {
    doc,
    history,
    selection,
    selectedNodes,
    view,
    editing,
    connectFrom,
    snapToGrid,
    message,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    setView,
    setViewportSize,
    setSelection,
    setEditing,
    setConnectFrom,
    setSnapToGrid,
    announce,
    change,
    endGesture,
    fit,
    zoomBy,
    resetZoom,
    selectOnly,
    selectAll,
    clearSelection,
    addShape,
    deleteSelected,
    nudge,
    duplicateSelected,
    copy,
    paste,
    cut,
    setText,
    setEdgeLabel,
    patchSelectedNodes,
    setColor,
    alignSelected,
    distributeSelected,
    toFront,
    reverseEdge,
    connectNodes,
    startConnect,
    cancelConnect,
    undo: doUndo,
    redo: doRedo,
    importText,
    newDiagram,
    loadSample,
    exportAs,
  };
}
