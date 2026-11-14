import { useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from './components/Canvas';
import { Inspector } from './components/Inspector';
import { Toolbar } from './components/Toolbar';
import { EditorContext, useEditorContext } from './editor/context';
import { count } from './editor/dom';
import { useEditor } from './editor/useEditor';
import { shortcuts, useShortcuts } from './editor/useShortcuts';

export default function App() {
  const editor = useEditor();
  const helpRef = useRef<HTMLDialogElement>(null);
  const openHelp = useCallback(() => helpRef.current?.showModal(), []);
  useShortcuts(editor, openHelp);

  return (
    <EditorContext.Provider value={editor}>
      <div className="app">
        <header className="app__header">
          <h1 className="app__title">
            Diagram editor <span className="app__subtitle">SVG · saved in this browser</span>
          </h1>
          <Toolbar onHelp={openHelp} />
        </header>
        <main className="app__main">
          <Canvas />
          <Inspector />
        </main>
        <StatusBar />
      </div>

      <dialog ref={helpRef} className="dialog" aria-labelledby="help-title">
        <div className="dialog__head">
          <h2 id="help-title">Keyboard and mouse</h2>
          <button type="button" className="btn" onClick={() => helpRef.current?.close()}>
            Close
          </button>
        </div>
        <table className="shortcuts">
          <tbody>
            {shortcuts.map((s) => (
              <tr key={s.keys}>
                <th scope="row">
                  <kbd>{s.keys}</kbd>
                </th>
                <td>{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </dialog>
    </EditorContext.Provider>
  );
}

function StatusBar() {
  const editor = useEditorContext();
  const { message, selection, connectFrom } = editor;
  const [expired, setExpired] = useState(0);

  // Keep errors on screen a little longer than routine confirmations.
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setExpired(message.at), message.tone === 'error' ? 6000 : 3000);
    return () => clearTimeout(timer);
  }, [message]);
  const visible = message && message.at !== expired ? message : null;

  const status = connectFrom
    ? 'Connecting: click or Tab to a shape and press Enter. Escape cancels.'
    : selection.nodes.length || selection.edges.length
      ? `${count(selection.nodes.length, 'shape')}, ${count(selection.edges.length, 'connector')} selected`
      : 'Nothing selected';

  return (
    <footer className="status">
      <span className="status__left">{status}</span>
      <span className={`status__message status__message--${visible?.tone ?? 'info'}`} role="status" aria-live="polite">
        {visible?.text ?? ''}
      </span>
    </footer>
  );
}

