import { useEffect, useRef, useState } from 'react';
import { useEditorContext } from '../editor/context';
import { worldToScreen } from '../model/geometry';
import { FONT_SIZE, edgeGeometry } from '../model/render';

/** An HTML field laid over the shape (or connector label) being edited, scaled with the view. */
export function TextEditor() {
  const editor = useEditorContext();
  const { editing, doc, view } = editor;
  const node = editing?.kind === 'node' ? doc.nodes.find((n) => n.id === editing.id) : undefined;
  const edge = editing?.kind === 'edge' ? doc.edges.find((e) => e.id === editing.id) : undefined;
  const initial = node?.text ?? edge?.label ?? '';
  const [value, setValue] = useState(initial);
  const fieldRef = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    fieldRef.current?.focus();
    fieldRef.current?.select();
  }, []);

  if (!editing || (!node && !edge)) return null;

  function finish(save: boolean) {
    if (done.current) return;
    done.current = true;
    if (save && node) editor.setText(node.id, value.trim());
    if (save && edge) editor.setEdgeLabel(edge.id, value.trim());
    editor.setEditing(null);
    // Return focus to the shape so keyboard work can continue.
    if (node) requestAnimationFrame(() => document.querySelector<SVGGElement>(`[data-node-id="${node.id}"]`)?.focus());
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    event.stopPropagation();
    if (event.key === 'Escape') finish(false);
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      finish(true);
    }
  };

  const fontSize = FONT_SIZE * view.zoom;

  if (node) {
    const topLeft = worldToScreen(node, view);
    return (
      <textarea
        ref={fieldRef}
        className="text-editor"
        aria-label="Shape text"
        value={value}
        style={{ left: topLeft.x, top: topLeft.y, width: node.w * view.zoom, height: node.h * view.zoom, fontSize }}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => finish(true)}
      />
    );
  }

  const geometry = edgeGeometry(doc, edge!.from, edge!.to);
  if (!geometry) return null;
  const mid = worldToScreen(geometry.mid, view);
  return (
    <input
      ref={fieldRef}
      className="text-editor text-editor--label"
      aria-label="Connector label"
      value={value}
      placeholder="Label"
      style={{ left: mid.x, top: mid.y, fontSize }}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => finish(true)}
    />
  );
}
