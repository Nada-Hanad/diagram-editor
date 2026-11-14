import { useEffect } from 'react';
import { isTyping } from './dom';
import { GRID } from '../model/geometry';
import type { Editor } from './useEditor';

export const shortcuts: { keys: string; action: string }[] = [
  { keys: 'R · E · D · N', action: 'Add a rectangle, ellipse, decision or note' },
  { keys: 'Double-click', action: 'Add a box, or edit a shape’s text' },
  { keys: 'Tab / Shift+Tab', action: 'Move between shapes' },
  { keys: 'Enter', action: 'Edit the selected shape’s text (Shift+Enter for a new line)' },
  { keys: 'Arrow keys', action: 'Move the selection 1 px; with Shift, one grid step' },
  { keys: 'C, then Tab and Enter', action: 'Connect the selected shape to another' },
  { keys: '⌘/Ctrl + A', action: 'Select everything' },
  { keys: '⌘/Ctrl + D', action: 'Duplicate' },
  { keys: '⌘/Ctrl + C · X · V', action: 'Copy, cut, paste' },
  { keys: 'Delete / Backspace', action: 'Delete the selection' },
  { keys: '⌘/Ctrl + Z · Shift+⌘/Ctrl + Z', action: 'Undo, redo' },
  { keys: '+ · − · 0 · Shift+1', action: 'Zoom in, out, to 100 %, to fit' },
  { keys: 'Space + drag', action: 'Pan (or scroll; Ctrl/⌘ + scroll zooms)' },
  { keys: 'Alt while dragging', action: 'Ignore the grid' },
  { keys: 'Escape', action: 'Cancel connecting, then clear the selection' },
  { keys: '?', action: 'Show this list' },
];

export function useShortcuts(editor: Editor, openHelp: () => void) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (isTyping(event.target) || editor.editing) return;
      if ((event.target as Element | null)?.closest?.('[role="menu"], dialog')) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      const focusedNode = (document.activeElement as Element | null)?.closest<SVGElement>('[data-node-id]')?.dataset.nodeId;

      const run = (action: () => void) => {
        event.preventDefault();
        action();
      };

      if (mod) {
        if (key === 'z' && event.shiftKey) return run(editor.redo);
        if (key === 'z') return run(editor.undo);
        if (key === 'y') return run(editor.redo);
        if (key === 'a') return run(editor.selectAll);
        if (key === 'd') return run(editor.duplicateSelected);
        if (key === 'c') return run(editor.copy);
        if (key === 'x') return run(editor.cut);
        if (key === 'v') return run(editor.paste);
        return;
      }
      if (event.altKey) return;

      if (event.key.startsWith('Arrow')) {
        const step = event.shiftKey ? GRID : 1;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        if (editor.selection.nodes.length) return run(() => editor.nudge(dx, dy));
        return run(() => editor.setView((v) => ({ ...v, x: v.x - dx * 40, y: v.y - dy * 40 })));
      }

      switch (event.key) {
        case 'Delete':
        case 'Backspace':
          return run(editor.deleteSelected);
        case 'Escape':
          if (editor.connectFrom) return run(editor.cancelConnect);
          return run(editor.clearSelection);
        case 'Enter':
          if (editor.connectFrom && focusedNode) {
            return run(() => {
              if (editor.connectNodes(editor.connectFrom!, focusedNode)) editor.setConnectFrom(null);
            });
          }
          if (editor.selection.nodes.length === 1) return run(() => editor.setEditing({ kind: 'node', id: editor.selection.nodes[0] }));
          if (editor.selection.edges.length === 1) return run(() => editor.setEditing({ kind: 'edge', id: editor.selection.edges[0] }));
          return;
        case '+':
        case '=':
          return run(() => editor.zoomBy(1.25));
        case '-':
        case '_':
          return run(() => editor.zoomBy(1 / 1.25));
        case '0':
          return run(editor.resetZoom);
        case '!':
          return run(() => editor.fit());
        case '?':
          return run(openHelp);
      }

      if (event.shiftKey) return;
      switch (key) {
        case 'r':
          return run(() => editor.addShape('rect'));
        case 'e':
          return run(() => editor.addShape('ellipse'));
        case 'd':
          return run(() => editor.addShape('diamond'));
        case 'n':
          return run(() => editor.addShape('note'));
        case 'c':
          return run(editor.startConnect);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor, openHelp]);
}
