import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useEditorContext } from '../editor/context';
import { isTyping } from '../editor/dom';
import {
  GRID,
  MIN_SIZE,
  bounds,
  intersects,
  rectFromPoints,
  resize,
  screenToWorld,
  snap,
  zoomAt,
  type Handle,
} from '../model/geometry';
import { edgeGeometry } from '../model/render';
import type { Point, Rect, Selection, Viewport } from '../model/types';
import { EdgeView, NodeView, SelectionFrame } from './Shapes';
import { TextEditor } from './TextEditor';

type Gesture =
  | {
      kind: 'move';
      pointerId: number;
      start: Point;
      origins: Map<string, Point>;
      primary: string;
      additive: boolean;
      moved: boolean;
      key: string;
    }
  | { kind: 'resize'; pointerId: number; start: Point; id: string; rect: Rect; handle: Handle; key: string }
  | { kind: 'marquee'; pointerId: number; start: Point; base: Selection }
  | { kind: 'pan'; pointerId: number; start: Point; view: Viewport }
  | { kind: 'connect'; pointerId: number; from: string }
  | { kind: 'pinch'; ids: [number, number]; distance: number; mid: Point; view: Viewport };

const DRAG_THRESHOLD = 3;
let gestureCount = 0;

export function Canvas() {
  const editor = useEditorContext();
  const { doc, view, selection, editing, connectFrom, snapToGrid } = editor;
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const touches = useRef(new Map<number, Point>());
  const spaceDown = useRef(false);
  const pointerFocus = useRef(false);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [preview, setPreview] = useState<{ from: string; to: Point; target: string | null } | null>(null);
  const [panning, setPanning] = useState(false);

  // Measure the canvas and fit the diagram once on first layout.
  const fitted = useRef(false);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      editor.setViewportSize(entry.contentRect.width, entry.contentRect.height);
      if (!fitted.current && entry.contentRect.width > 0) {
        fitted.current = true;
        editor.fit();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [editor]);

  const local = useCallback((event: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  // Wheel must be non-passive to stop the page from scrolling or zooming.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const scale = event.deltaMode === 1 ? 16 : 1;
      if (event.ctrlKey || event.metaKey) {
        editor.zoomBy(Math.exp(-event.deltaY * scale * 0.01), local(event));
      } else {
        editor.setView((v) => ({ ...v, x: v.x - event.deltaX * scale, y: v.y - event.deltaY * scale }));
      }
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [editor, local]);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isTyping(event.target)) {
        spaceDown.current = true;
        setPanning(true);
        if (event.target === document.body || svgRef.current?.contains(event.target as Node)) event.preventDefault();
      }
    };
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        spaceDown.current = false;
        setPanning(false);
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (editing) return;
    const point = local(event);
    const target = event.target as Element;

    if (event.pointerType === 'touch') {
      touches.current.set(event.pointerId, point);
      if (touches.current.size === 2) {
        const [[a, pa], [b, pb]] = [...touches.current.entries()];
        gesture.current = {
          kind: 'pinch',
          ids: [a, b],
          distance: Math.hypot(pa.x - pb.x, pa.y - pb.y),
          mid: { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 },
          view,
        };
        setMarquee(null);
        return;
      }
    }

    pointerFocus.current = true;

    if (event.button === 1 || spaceDown.current) {
      gesture.current = { kind: 'pan', pointerId: event.pointerId, start: point, view };
      setPanning(true);
      return;
    }
    if (event.button !== 0) return;

    const handle = target.closest<SVGElement>('[data-handle]')?.dataset.handle as Handle | undefined;
    const port = target.closest<SVGElement>('[data-port]')?.dataset.port;
    const nodeId = target.closest<SVGElement>('[data-node-id]')?.dataset.nodeId;
    const edgeId = target.closest<SVGElement>('[data-edge-id]')?.dataset.edgeId;

    if (handle && selection.nodes.length === 1) {
      const node = doc.nodes.find((n) => n.id === selection.nodes[0])!;
      gesture.current = {
        kind: 'resize',
        pointerId: event.pointerId,
        start: point,
        id: node.id,
        rect: { x: node.x, y: node.y, w: node.w, h: node.h },
        handle,
        key: `resize:${++gestureCount}`,
      };
      return;
    }

    if (port) {
      gesture.current = { kind: 'connect', pointerId: event.pointerId, from: port };
      setPreview({ from: port, to: screenToWorld(point, view), target: null });
      return;
    }

    if (nodeId) {
      event.preventDefault();
      let ids: string[];
      if (event.shiftKey || event.metaKey) {
        ids = selection.nodes.includes(nodeId) ? selection.nodes.filter((id) => id !== nodeId) : [...selection.nodes, nodeId];
        editor.setSelection({ nodes: ids, edges: selection.edges });
      } else if (selection.nodes.includes(nodeId)) {
        ids = selection.nodes;
      } else {
        ids = [nodeId];
        editor.selectOnly({ nodes: ids });
      }
      if (connectFrom) {
        editor.connectNodes(connectFrom, nodeId);
        editor.setConnectFrom(null);
        return;
      }
      const origins = new Map(doc.nodes.filter((n) => ids.includes(n.id)).map((n) => [n.id, { x: n.x, y: n.y }]));
      gesture.current = {
        kind: 'move',
        pointerId: event.pointerId,
        start: point,
        origins,
        primary: nodeId,
        additive: event.shiftKey || event.metaKey,
        moved: false,
        key: `move:${++gestureCount}`,
      };
      (target.closest('[data-node-id]') as SVGGElement | null)?.focus({ preventScroll: true });
      return;
    }

    if (edgeId) {
      editor.selectOnly({ edges: [edgeId] });
      return;
    }

    if (connectFrom) editor.cancelConnect();
    const base = event.shiftKey ? selection : { nodes: [], edges: [] };
    if (!event.shiftKey) editor.clearSelection();
    gesture.current = { kind: 'marquee', pointerId: event.pointerId, start: point, base };
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g) return;
    const point = local(event);

    if (g.kind === 'pinch') {
      if (!touches.current.has(event.pointerId)) return;
      touches.current.set(event.pointerId, point);
      const pa = touches.current.get(g.ids[0]);
      const pb = touches.current.get(g.ids[1]);
      if (!pa || !pb) return;
      const mid = { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
      const zoomed = zoomAt(g.view, g.mid, Math.hypot(pa.x - pb.x, pa.y - pb.y) / g.distance);
      editor.setView({ ...zoomed, x: zoomed.x + mid.x - g.mid.x, y: zoomed.y + mid.y - g.mid.y });
      return;
    }
    if (event.pointerId !== g.pointerId) return;
    // Capture only once a drag is under way: capturing on pointerdown would
    // retarget the following click/dblclick to the <svg> and break double-click editing.
    const svg = svgRef.current!;
    if (!svg.hasPointerCapture(event.pointerId)) svg.setPointerCapture(event.pointerId);

    switch (g.kind) {
      case 'pan':
        editor.setView({ ...g.view, x: g.view.x + point.x - g.start.x, y: g.view.y + point.y - g.start.y });
        break;
      case 'move': {
        if (!g.moved && Math.hypot(point.x - g.start.x, point.y - g.start.y) < DRAG_THRESHOLD) return;
        g.moved = true;
        let dx = (point.x - g.start.x) / view.zoom;
        let dy = (point.y - g.start.y) / view.zoom;
        // Snap the grabbed shape's corner; the rest of the selection keeps its offsets.
        if (snapToGrid && !event.altKey) {
          const origin = g.origins.get(g.primary)!;
          dx = snap(origin.x + dx) - origin.x;
          dy = snap(origin.y + dy) - origin.y;
        }
        editor.change(
          (current) => ({
            ...current,
            nodes: current.nodes.map((n) => {
              const o = g.origins.get(n.id);
              return o ? { ...n, x: o.x + dx, y: o.y + dy } : n;
            }),
          }),
          g.key,
        );
        break;
      }
      case 'resize': {
        const dx = (point.x - g.start.x) / view.zoom;
        const dy = (point.y - g.start.y) / view.zoom;
        let r = resize(g.rect, g.handle, dx, dy, event.shiftKey);
        if (snapToGrid && !event.altKey && !event.shiftKey) r = snapRect(r, g.handle);
        editor.change((current) => ({ ...current, nodes: current.nodes.map((n) => (n.id === g.id ? { ...n, ...r } : n)) }), g.key);
        break;
      }
      case 'marquee': {
        const rect = rectFromPoints(g.start, point);
        setMarquee(rect);
        const a = screenToWorld({ x: rect.x, y: rect.y }, view);
        const world = { x: a.x, y: a.y, w: rect.w / view.zoom, h: rect.h / view.zoom };
        const hit = doc.nodes.filter((n) => intersects(world, n)).map((n) => n.id);
        const nodes = [...new Set([...g.base.nodes, ...hit])];
        const edges = doc.edges.filter((e) => nodes.includes(e.from) && nodes.includes(e.to)).map((e) => e.id);
        editor.setSelection({ nodes, edges: [...new Set([...g.base.edges, ...edges])] });
        break;
      }
      case 'connect': {
        const under = document.elementFromPoint(event.clientX, event.clientY)?.closest<SVGElement>('[data-node-id]');
        const target = under?.dataset.nodeId && under.dataset.nodeId !== g.from ? under.dataset.nodeId : null;
        setPreview({ from: g.from, to: screenToWorld(point, view), target });
        break;
      }
    }
  }

  function onPointerUp(event: React.PointerEvent<SVGSVGElement>) {
    touches.current.delete(event.pointerId);
    const g = gesture.current;
    pointerFocus.current = false;
    if (!g) return;
    if (g.kind === 'pinch') {
      if (touches.current.size < 2) gesture.current = null;
      return;
    }
    if (event.pointerId !== g.pointerId) return;
    gesture.current = null;

    switch (g.kind) {
      case 'pan':
        setPanning(spaceDown.current);
        break;
      case 'move':
        // A click (no drag) on one shape of a multi-selection narrows the selection to it.
        if (!g.moved && !g.additive && g.origins.size > 1) editor.selectOnly({ nodes: [g.primary] });
        editor.endGesture();
        break;
      case 'resize':
        editor.endGesture();
        break;
      case 'marquee':
        setMarquee(null);
        break;
      case 'connect': {
        const target = preview?.target;
        setPreview(null);
        if (target) editor.connectNodes(g.from, target);
        break;
      }
    }
  }

  function onDoubleClick(event: React.MouseEvent<SVGSVGElement>) {
    const target = event.target as Element;
    const nodeId = target.closest<SVGElement>('[data-node-id]')?.dataset.nodeId;
    const edgeId = target.closest<SVGElement>('[data-edge-id]')?.dataset.edgeId;
    if (nodeId) editor.setEditing({ kind: 'node', id: nodeId });
    else if (edgeId) editor.setEditing({ kind: 'edge', id: edgeId });
    else if (!target.closest('[data-handle],[data-port]')) {
      editor.addShape('rect', screenToWorld(local(event), view), { edit: true });
    }
  }

  const onNodeFocus = useCallback(
    (id: string) => {
      // Pointer handling already set the selection; focus from Tab selects the shape.
      if (pointerFocus.current) return;
      if (!editor.selection.nodes.includes(id)) editor.selectOnly({ nodes: [id] });
    },
    [editor],
  );

  const selectedSet = useMemo(() => new Set(selection.nodes), [selection.nodes]);
  const selectedEdges = useMemo(() => new Set(selection.edges), [selection.edges]);
  const selectionBox = useMemo(
    () => bounds(doc.nodes.filter((n) => selectedSet.has(n.id))),
    [doc.nodes, selectedSet],
  );
  const previewSource = preview ? doc.nodes.find((n) => n.id === preview.from) : null;
  const gridSize = GRID * view.zoom;

  return (
    <div
      className="canvas"
      ref={containerRef}
      data-panning={panning || undefined}
      data-connecting={connectFrom || preview ? '' : undefined}
    >
      <svg
        ref={svgRef}
        className="canvas__svg"
        role="application"
        aria-label="Diagram canvas"
        aria-describedby="canvas-help"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(event) => event.preventDefault()}
      >
        <defs>
          <pattern id="grid" width={gridSize} height={gridSize} x={view.x} y={view.y} patternUnits="userSpaceOnUse">
            <circle cx={1} cy={1} r={view.zoom < 0.5 ? 0.6 : 1} className="canvas__dot" />
          </pattern>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" className="marker" />
          </marker>
          <marker id="arrow-selected" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" className="marker marker--selected" />
          </marker>
        </defs>
        <rect className="canvas__bg" width="100%" height="100%" fill="url(#grid)" />
        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {doc.edges.map((edge) => {
            const geometry = edgeGeometry(doc, edge.from, edge.to);
            return geometry ? (
              <EdgeView
                key={edge.id}
                edge={edge}
                geometry={geometry}
                selected={selectedEdges.has(edge.id)}
                hideLabel={editing?.kind === 'edge' && editing.id === edge.id}
              />
            ) : null;
          })}
          {doc.nodes.map((node) => (
            <NodeView
              key={node.id}
              node={node}
              selected={selectedSet.has(node.id)}
              hideText={editing?.kind === 'node' && editing.id === node.id}
              connectState={
                connectFrom === node.id || preview?.from === node.id ? 'source' : preview?.target === node.id ? 'target' : null
              }
              onFocus={onNodeFocus}
            />
          ))}
          {selectionBox && (
            <SelectionFrame rect={selectionBox} zoom={view.zoom} handles={selection.nodes.length === 1 && !editing} />
          )}
          {preview && previewSource && (
            <line
              className="canvas__preview"
              x1={previewSource.x + previewSource.w / 2}
              y1={previewSource.y + previewSource.h / 2}
              x2={preview.to.x}
              y2={preview.to.y}
              strokeWidth={1.5 / view.zoom}
            />
          )}
        </g>
        {marquee && <rect className="canvas__marquee" x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} />}
      </svg>

      {editing && <TextEditor key={`${editing.kind}:${editing.id}`} />}

      {doc.nodes.length === 0 && (
        <div className="canvas__empty">
          <p className="canvas__empty-title">An empty diagram</p>
          <p>Double-click anywhere to add a box, or use the shape buttons above.</p>
          <button type="button" className="btn" onClick={editor.loadSample}>
            Load the example
          </button>
        </div>
      )}

      <p id="canvas-help" className="visually-hidden">
        Use Tab to move between shapes. Arrow keys move the selected shapes, Enter edits text, C starts a connector, Delete
        removes. Press question mark for all shortcuts.
      </p>
    </div>
  );
}

function snapRect(r: Rect, handle: Handle): Rect {
  let { x, y, w, h } = r;
  if (handle.includes('e')) w = Math.max(MIN_SIZE, snap(x + w) - x);
  if (handle.includes('s')) h = Math.max(MIN_SIZE, snap(y + h) - y);
  if (handle.includes('w')) {
    const right = x + w;
    x = Math.min(snap(x), right - MIN_SIZE);
    w = right - x;
  }
  if (handle.includes('n')) {
    const bottom = y + h;
    y = Math.min(snap(y), bottom - MIN_SIZE);
    h = bottom - y;
  }
  return { x, y, w, h };
}
