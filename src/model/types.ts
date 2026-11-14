export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };

export const SHAPES = ['rect', 'ellipse', 'diamond', 'note'] as const;
export type Shape = (typeof SHAPES)[number];

export const COLORS = ['slate', 'blue', 'green', 'amber', 'rose', 'violet'] as const;
export type Color = (typeof COLORS)[number];

export type DiagramNode = Rect & {
  id: string;
  shape: Shape;
  text: string;
  color: Color;
};

export type DiagramEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
};

/** The persisted document. Arrays keep z-order (later = on top). */
export type Doc = {
  version: 1;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
};

/** Screen = world * zoom + offset. */
export type Viewport = { x: number; y: number; zoom: number };

export type Selection = { nodes: string[]; edges: string[] };

export const emptySelection: Selection = { nodes: [], edges: [] };

export const shapeLabel: Record<Shape, string> = {
  rect: 'Rectangle',
  ellipse: 'Ellipse',
  diamond: 'Decision',
  note: 'Note',
};
