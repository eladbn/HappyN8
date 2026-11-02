import { useCallback, useReducer } from 'react';
import type { Draft } from '../lib/workflow';

interface State {
  draft: Draft | null;
  past: Draft[];
  future: Draft[];
  dirty: boolean;
}

type Action =
  | { t: 'load'; draft: Draft }
  | { t: 'update'; fn: (d: Draft) => Draft; history: boolean }
  | { t: 'undo' }
  | { t: 'redo' }
  | { t: 'saved' };

const LIMIT = 100;

function reducer(s: State, a: Action): State {
  switch (a.t) {
    case 'load':
      return { draft: a.draft, past: [], future: [], dirty: false };
    case 'update': {
      if (!s.draft) return s;
      const next = a.fn(s.draft);
      if (next === s.draft) return s;
      return {
        draft: next,
        past: a.history ? [...s.past.slice(-LIMIT + 1), s.draft] : s.past,
        future: a.history ? [] : s.future,
        dirty: true,
      };
    }
    case 'undo': {
      if (!s.draft || !s.past.length) return s;
      return { draft: s.past[s.past.length - 1], past: s.past.slice(0, -1), future: [s.draft, ...s.future], dirty: true };
    }
    case 'redo': {
      if (!s.draft || !s.future.length) return s;
      return { draft: s.future[0], past: [...s.past, s.draft], future: s.future.slice(1), dirty: true };
    }
    case 'saved':
      return { ...s, dirty: false };
    default:
      return s;
  }
}

/** Editor document state with undo/redo. */
export function useDraft() {
  const [state, dispatch] = useReducer(reducer, { draft: null, past: [], future: [], dirty: false });
  const load = useCallback((draft: Draft) => dispatch({ t: 'load', draft }), []);
  const update = useCallback((fn: (d: Draft) => Draft, history = true) => dispatch({ t: 'update', fn, history }), []);
  const undo = useCallback(() => dispatch({ t: 'undo' }), []);
  const redo = useCallback(() => dispatch({ t: 'redo' }), []);
  const markSaved = useCallback(() => dispatch({ t: 'saved' }), []);
  return {
    draft: state.draft,
    dirty: state.dirty,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    load, update, undo, redo, markSaved,
  };
}

export type DraftApi = ReturnType<typeof useDraft>;
