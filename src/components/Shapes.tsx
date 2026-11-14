import { memo } from 'react';
import { HANDLES, handlePosition, type Handle } from '../model/geometry';
import { LINE_HEIGHT, measureText, shapeGeometry, textLines, type EdgeGeometry } from '../model/render';
import { shapeLabel, type DiagramEdge, type DiagramNode, type Rect } from '../model/types';

export function ShapeOutline({ node, className }: { node: DiagramNode; className: string }) {
  const g = shapeGeometry(node);
  if (g.kind === 'rect') return <rect className={className} x={g.x} y={g.y} width={g.w} height={g.h} rx={g.r} />;
  if (g.kind === 'ellipse') return <ellipse className={className} cx={g.cx} cy={g.cy} rx={g.rx} ry={g.ry} />;
  return <path className={className} d={g.d} />;
}

const PORT_OFFSET = 14;

type NodeProps = {
  node: DiagramNode;
  selected: boolean;
  hideText: boolean;
  connectState: 'source' | 'target' | null;
  onFocus: (id: string) => void;
};

export const NodeView = memo(function NodeView({ node, selected, hideText, connectState, onFocus }: NodeProps) {
  const lines = hideText ? [] : textLines(node);
  const cx = node.x + node.w / 2;
  const firstY = node.y + node.h / 2 - ((lines.length - 1) * LINE_HEIGHT) / 2;
  const ports = [
    { side: 'n', x: cx, y: node.y - PORT_OFFSET },
    { side: 'e', x: node.x + node.w + PORT_OFFSET, y: node.y + node.h / 2 },
    { side: 's', x: cx, y: node.y + node.h + PORT_OFFSET },
    { side: 'w', x: node.x - PORT_OFFSET, y: node.y + node.h / 2 },
  ];
  return (
    <g
      className="node"
      data-node-id={node.id}
      data-color={node.color}
      data-selected={selected || undefined}
      data-connect={connectState ?? undefined}
      tabIndex={0}
      role="button"
      aria-pressed={selected}
      aria-label={`${shapeLabel[node.shape]}: ${node.text || 'no text'}`}
      onFocus={() => onFocus(node.id)}
    >
      <ShapeOutline node={node} className="node__shape" />
      <text className="node__text" textAnchor="middle" dominantBaseline="central">
        {lines.map((line, i) => (
          <tspan key={i} x={cx} y={firstY + i * LINE_HEIGHT}>
            {line}
          </tspan>
        ))}
      </text>
      {ports.map((port) => (
        <circle key={port.side} className="node__port" data-port={node.id} cx={port.x} cy={port.y} r={6} aria-hidden="true">
          <title>Drag to connect</title>
        </circle>
      ))}
    </g>
  );
});

export const EdgeView = memo(function EdgeView({
  edge,
  geometry,
  selected,
  hideLabel,
}: {
  edge: DiagramEdge;
  geometry: EdgeGeometry;
  selected: boolean;
  hideLabel: boolean;
}) {
  const { start, end, mid } = geometry;
  const labelWidth = edge.label ? measureText(edge.label) + 12 : 0;
  return (
    <g className="edge" data-edge-id={edge.id} data-selected={selected || undefined}>
      <line className="edge__hit" x1={start.x} y1={start.y} x2={end.x} y2={end.y} />
      <line
        className="edge__line"
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        markerEnd={selected ? 'url(#arrow-selected)' : 'url(#arrow)'}
      />
      {edge.label && !hideLabel && (
        <g className="edge__label">
          <rect x={mid.x - labelWidth / 2} y={mid.y - 11} width={labelWidth} height={22} rx={4} />
          <text x={mid.x} y={mid.y} textAnchor="middle" dominantBaseline="central">
            {edge.label}
          </text>
        </g>
      )}
    </g>
  );
});

export function SelectionFrame({ rect, zoom, handles }: { rect: Rect; zoom: number; handles: boolean }) {
  const size = 9 / zoom;
  const pad = 4 / zoom;
  return (
    <g className="selection" aria-hidden="true">
      <rect
        className="selection__frame"
        x={rect.x - pad}
        y={rect.y - pad}
        width={rect.w + pad * 2}
        height={rect.h + pad * 2}
        strokeWidth={1 / zoom}
      />
      {handles &&
        HANDLES.map((handle: Handle) => {
          const p = handlePosition(rect, handle);
          return (
            <rect
              key={handle}
              className="selection__handle"
              data-handle={handle}
              x={p.x - size / 2}
              y={p.y - size / 2}
              width={size}
              height={size}
              strokeWidth={1.5 / zoom}
            />
          );
        })}
    </g>
  );
}
