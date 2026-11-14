import { parseDoc, sampleDoc } from './doc';
import type { Doc } from './types';

export const STORAGE_KEY = 'diagram-editor.doc.v1';

/** Last saved diagram, or the sample on a first visit or after a corrupt save. */
export function loadDoc(): Doc {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return parseDoc(JSON.parse(raw));
  } catch {
    // Unreadable storage or an old/corrupt save: fall back rather than crash.
  }
  return sampleDoc();
}

export function saveDoc(doc: Doc): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch {
    // Quota or privacy mode; the editor keeps working without persistence.
  }
}
