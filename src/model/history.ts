import type { Doc } from './types';

export type History = {
  past: Doc[];
  present: Doc;
  future: Doc[];
  /** Key and time of the last commit, used to merge a stream of edits into one step. */
  lastKey: string | null;
  lastAt: number;
};

export const HISTORY_LIMIT = 200;
/** Repeated edits with the same key inside this window become one undo step (e.g. arrow-key nudges). */
export const COALESCE_MS = 800;

export function createHistory(present: Doc): History {
  return { past: [], present, future: [], lastKey: null, lastAt: 0 };
}

/**
 * Records `next` as the new present. With a `key`, consecutive commits that
 * share it (a drag's many pointer moves, a burst of nudges) replace each other
 * instead of adding steps, so one gesture undoes in one step.
 */
export function commit(history: History, next: Doc, key: string | null = null, now = Date.now()): History {
  if (next === history.present) return history;
  const merge = key !== null && key === history.lastKey && now - history.lastAt <= COALESCE_MS;
  return {
    past: merge ? history.past : [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
    lastKey: key,
    lastAt: now,
  };
}

/** Ends any coalescing run, so the next keyed commit starts a new step. */
export function seal(history: History): History {
  return history.lastKey === null ? history : { ...history, lastKey: null };
}

export function undo(history: History): History {
  const previous = history.past.at(-1);
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    lastKey: null,
    lastAt: 0,
  };
}

export function redo(history: History): History {
  const [next, ...rest] = history.future;
  if (!next) return history;
  return { past: [...history.past, history.present], present: next, future: rest, lastKey: null, lastAt: 0 };
}

/** Replaces the document without an undo step (loading a file resets history instead). */
export function reset(present: Doc): History {
  return createHistory(present);
}
