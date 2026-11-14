import { useRef, useState } from 'react';
import { useEditorContext } from '../editor/context';
import { SHAPES, shapeLabel } from '../model/types';
import { Icon } from './Icon';

const shapeKeys = { rect: 'R', ellipse: 'E', diamond: 'D', note: 'N' } as const;

type FileAction = 'new' | 'sample' | 'import' | 'svg' | 'png' | 'json';
const fileActions: [FileAction, string][] = [
  ['new', 'New diagram'],
  ['sample', 'Load the example'],
  ['import', 'Import JSON…'],
  ['svg', 'Export SVG'],
  ['png', 'Export PNG'],
  ['json', 'Export JSON'],
];

export function Toolbar({ onHelp }: { onHelp: () => void }) {
  const editor = useEditorContext();
  const fileInput = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  async function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 2_000_000) return editor.announce('Import failed. The file is larger than 2 MB.', 'error');
    editor.importText(await file.text());
  }

  function closeMenu(focusTrigger = false) {
    setMenuOpen(false);
    if (focusTrigger) menuRef.current?.querySelector<HTMLButtonElement>('[aria-haspopup]')?.focus();
  }

  function runFileAction(action: FileAction) {
    closeMenu(true);
    if (action === 'new') editor.newDiagram();
    else if (action === 'sample') editor.loadSample();
    else if (action === 'import') fileInput.current?.click();
    else editor.exportAs(action);
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Editor tools">
      <div className="toolbar__group" role="group" aria-label="Add shape">
        {SHAPES.map((shape) => (
          <button
            key={shape}
            type="button"
            className="tool"
            title={`${shapeLabel[shape]} (${shapeKeys[shape]})`}
            aria-label={`Add ${shapeLabel[shape].toLowerCase()}`}
            onClick={() => editor.addShape(shape)}
          >
            <Icon name={shape} />
          </button>
        ))}
        <button
          type="button"
          className="tool"
          title="Connect selected shape (C)"
          aria-label="Connect from selected shape"
          aria-pressed={Boolean(editor.connectFrom)}
          disabled={editor.selection.nodes.length !== 1}
          onClick={() => (editor.connectFrom ? editor.cancelConnect() : editor.startConnect())}
        >
          <Icon name="connect" />
        </button>
      </div>

      <div className="toolbar__group" role="group" aria-label="History">
        <button type="button" className="tool" title="Undo (⌘Z)" aria-label="Undo" disabled={!editor.canUndo} onClick={editor.undo}>
          <Icon name="undo" />
        </button>
        <button type="button" className="tool" title="Redo (⇧⌘Z)" aria-label="Redo" disabled={!editor.canRedo} onClick={editor.redo}>
          <Icon name="redo" />
        </button>
        <button
          type="button"
          className="tool"
          title="Delete (Backspace)"
          aria-label="Delete selection"
          disabled={!editor.selection.nodes.length && !editor.selection.edges.length}
          onClick={editor.deleteSelected}
        >
          <Icon name="trash" />
        </button>
      </div>

      <div className="toolbar__group" role="group" aria-label="Zoom">
        <button type="button" className="tool" title="Zoom out (−)" aria-label="Zoom out" onClick={() => editor.zoomBy(1 / 1.25)}>
          <Icon name="minus" />
        </button>
        <button type="button" className="tool tool--text" title="Reset to 100% (0)" aria-label="Reset zoom to 100%" onClick={editor.resetZoom}>
          <span aria-live="polite">{Math.round(editor.view.zoom * 100)}%</span>
        </button>
        <button type="button" className="tool" title="Zoom in (+)" aria-label="Zoom in" onClick={() => editor.zoomBy(1.25)}>
          <Icon name="plus" />
        </button>
        <button type="button" className="tool" title="Fit diagram (Shift+1)" aria-label="Fit diagram to screen" onClick={() => editor.fit()}>
          <Icon name="fit" />
        </button>
        <button
          type="button"
          className="tool"
          title="Snap to grid (hold Alt to override)"
          aria-label="Snap to grid"
          aria-pressed={editor.snapToGrid}
          onClick={() => editor.setSnapToGrid(!editor.snapToGrid)}
        >
          <Icon name="grid" />
        </button>
      </div>

      <div className="toolbar__spacer" />

      <div
        className="menu"
        ref={menuRef}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) closeMenu();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && menuOpen) {
            event.stopPropagation();
            closeMenu(true);
          }
        }}
      >
        <button
          type="button"
          className="tool tool--text"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls="file-menu"
          onClick={() => setMenuOpen((open) => !open)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setMenuOpen(true);
              requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus());
            }
          }}
        >
          <Icon name="file" />
          File
        </button>
        {menuOpen && (
          <div
            className="menu__list"
            id="file-menu"
            role="menu"
            aria-label="File"
            onKeyDown={(event) => {
              const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
              const index = items.indexOf(document.activeElement as HTMLButtonElement);
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault();
                const step = event.key === 'ArrowDown' ? 1 : -1;
                items[(index + step + items.length) % items.length]?.focus();
              }
            }}
          >
            {fileActions.map(([action, label]) => (
              <button key={action} type="button" role="menuitem" className="menu__item" onClick={() => runFileAction(action)}>
                {label}
              </button>
            ))}
          </div>
        )}
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={onFile} aria-hidden="true" tabIndex={-1} />
      </div>

      <button type="button" className="tool" title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts" onClick={onHelp}>
        <Icon name="help" />
      </button>
    </div>
  );
}
