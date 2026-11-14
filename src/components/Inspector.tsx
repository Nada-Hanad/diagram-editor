import { useId } from 'react';
import { useEditorContext } from '../editor/context';
import type { Alignment } from '../model/doc';
import { COLORS, SHAPES, shapeLabel, type DiagramNode } from '../model/types';
import { Icon, type IconName } from './Icon';

const alignments: { how: Alignment; icon: IconName; label: string }[] = [
  { how: 'left', icon: 'alignLeft', label: 'Align left edges' },
  { how: 'center', icon: 'alignCenter', label: 'Align centres horizontally' },
  { how: 'right', icon: 'alignRight', label: 'Align right edges' },
  { how: 'top', icon: 'alignTop', label: 'Align top edges' },
  { how: 'middle', icon: 'alignMiddle', label: 'Align centres vertically' },
  { how: 'bottom', icon: 'alignBottom', label: 'Align bottom edges' },
];

export function Inspector() {
  const editor = useEditorContext();
  const { doc, selection, selectedNodes } = editor;
  const edge = selection.nodes.length === 0 && selection.edges.length === 1 ? doc.edges.find((e) => e.id === selection.edges[0]) : undefined;

  return (
    <aside className="inspector" aria-label="Inspector">
      {selectedNodes.length === 1 && <NodePanel node={selectedNodes[0]} />}
      {selectedNodes.length > 1 && <MultiPanel count={selectedNodes.length} />}
      {edge && <EdgePanel id={edge.id} />}
      {selectedNodes.length === 0 && !edge && (
        <section className="panel">
          <h2 className="panel__title">Diagram</h2>
          <p className="panel__stat">
            {doc.nodes.length} shapes · {doc.edges.length} connectors
          </p>
          <ul className="panel__tips">
            <li>Double-click the canvas to add a box.</li>
            <li>Drag a shape’s side dot onto another shape to connect them.</li>
            <li>Drag on empty space to select several shapes; hold Space and drag to pan.</li>
            <li>Ctrl or ⌘ + scroll (or pinch) zooms around the pointer.</li>
          </ul>
        </section>
      )}
    </aside>
  );
}

function NodePanel({ node }: { node: DiagramNode }) {
  const editor = useEditorContext();
  const textId = useId();
  const connections = editor.doc.edges.filter((e) => e.from === node.id || e.to === node.id);
  const nameOf = (id: string) => {
    const other = editor.doc.nodes.find((n) => n.id === id);
    return other?.text || shapeLabel[other?.shape ?? 'rect'];
  };

  return (
    <section className="panel">
      <h2 className="panel__title">{shapeLabel[node.shape]}</h2>

      <label className="field__label" htmlFor={textId}>
        Text
      </label>
      <textarea
        id={textId}
        className="field__input"
        rows={3}
        value={node.text}
        onChange={(event) => editor.change((d) => ({ ...d, nodes: d.nodes.map((n) => (n.id === node.id ? { ...n, text: event.target.value } : n)) }), `text:${node.id}`)}
        onBlur={editor.endGesture}
      />

      <fieldset className="field">
        <legend className="field__label">Shape</legend>
        <div className="segmented">
          {SHAPES.map((shape) => (
            <label key={shape} className="segmented__option" title={shapeLabel[shape]}>
              <input type="radio" name="shape" checked={node.shape === shape} onChange={() => editor.patchSelectedNodes({ shape })} />
              <Icon name={shape} />
              <span className="visually-hidden">{shapeLabel[shape]}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <ColorField />

      <fieldset className="field">
        <legend className="field__label">Position and size</legend>
        <div className="grid-2">
          {(['x', 'y', 'w', 'h'] as const).map((key) => (
            <NumberField
              key={key}
              label={{ x: 'X', y: 'Y', w: 'Width', h: 'Height' }[key]}
              value={Math.round(node[key])}
              min={key === 'w' || key === 'h' ? 40 : undefined}
              onChange={(value) => editor.patchSelectedNodes({ [key]: value }, `geometry:${node.id}:${key}`)}
            />
          ))}
        </div>
      </fieldset>

      <div className="panel__actions">
        <button type="button" className="btn" onClick={editor.toFront}>
          Bring to front
        </button>
        <button type="button" className="btn" onClick={editor.duplicateSelected}>
          Duplicate
        </button>
      </div>

      {connections.length > 0 && (
        <div className="field">
          <h3 className="field__label">Connectors</h3>
          <ul className="connections">
            {connections.map((e) => (
              <li key={e.id}>
                <button type="button" className="btn btn--link" onClick={() => editor.selectOnly({ edges: [e.id] })}>
                  {e.from === node.id ? `→ ${nameOf(e.to)}` : `← ${nameOf(e.from)}`}
                  {e.label ? ` (${e.label})` : ''}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function MultiPanel({ count }: { count: number }) {
  const editor = useEditorContext();
  return (
    <section className="panel">
      <h2 className="panel__title">{count} shapes</h2>
      <div className="field">
        <h3 className="field__label">Align</h3>
        <div className="icon-row">
          {alignments.map((a) => (
            <button key={a.how} type="button" className="tool" aria-label={a.label} title={a.label} onClick={() => editor.alignSelected(a.how)}>
              <Icon name={a.icon} />
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <h3 className="field__label">Distribute</h3>
        <div className="icon-row">
          <button type="button" className="tool" aria-label="Distribute horizontally" title="Distribute horizontally (3 or more)" disabled={count < 3} onClick={() => editor.distributeSelected('x')}>
            <Icon name="distributeX" />
          </button>
          <button type="button" className="tool" aria-label="Distribute vertically" title="Distribute vertically (3 or more)" disabled={count < 3} onClick={() => editor.distributeSelected('y')}>
            <Icon name="distributeY" />
          </button>
        </div>
      </div>
      <ColorField />
    </section>
  );
}

function EdgePanel({ id }: { id: string }) {
  const editor = useEditorContext();
  const edge = editor.doc.edges.find((e) => e.id === id)!;
  const labelId = useId();
  return (
    <section className="panel">
      <h2 className="panel__title">Connector</h2>
      <label className="field__label" htmlFor={labelId}>
        Label
      </label>
      <input
        id={labelId}
        className="field__input"
        value={edge.label}
        onChange={(event) => editor.change((d) => ({ ...d, edges: d.edges.map((e) => (e.id === id ? { ...e, label: event.target.value } : e)) }), `label:${id}`)}
        onBlur={editor.endGesture}
      />
      <div className="panel__actions">
        <button type="button" className="btn" onClick={() => editor.reverseEdge(id)}>
          Reverse direction
        </button>
        <button type="button" className="btn" onClick={editor.deleteSelected}>
          Delete
        </button>
      </div>
    </section>
  );
}

function ColorField() {
  const editor = useEditorContext();
  const current = editor.selectedNodes.every((n) => n.color === editor.selectedNodes[0]?.color) ? editor.selectedNodes[0]?.color : null;
  return (
    <fieldset className="field">
      <legend className="field__label">Colour</legend>
      <div className="swatches">
        {COLORS.map((color) => (
          <label key={color} className="swatch" data-color={color} title={color}>
            <input type="radio" name="color" checked={current === color} onChange={() => editor.setColor(color)} />
            <span className="visually-hidden">{color}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function NumberField({ label, value, min, onChange }: { label: string; value: number; min?: number; onChange: (value: number) => void }) {
  const id = useId();
  return (
    <div>
      <label className="field__sublabel" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="field__input"
        type="number"
        value={value}
        min={min}
        step={10}
        onChange={(event) => {
          const next = event.target.valueAsNumber;
          if (Number.isFinite(next)) onChange(min !== undefined ? Math.max(min, next) : next);
        }}
      />
    </div>
  );
}
