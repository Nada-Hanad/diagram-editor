import { createContext, useContext } from 'react';
import type { Editor } from './useEditor';

export const EditorContext = createContext<Editor | null>(null);

export function useEditorContext(): Editor {
  const editor = useContext(EditorContext);
  if (!editor) throw new Error('useEditorContext must be used inside <EditorContext.Provider>');
  return editor;
}
