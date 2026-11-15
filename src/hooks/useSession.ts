import { useReducer } from 'react';
import type { Question, SavedExamState } from '../types';
import { reconcileSession, sessionReducer } from '../lib/session';
import { SESSION_KEY, loadJson } from '../lib/storage';
import { usePersistEffect } from './usePersistentState';

/** The in-progress session, restored from and saved to localStorage. */
export function useSession(questionById: Map<string, Question>, onSaveError: () => void) {
  const [session, dispatch] = useReducer(sessionReducer, null, () =>
    reconcileSession(loadJson<SavedExamState | null>(SESSION_KEY, null), questionById),
  );

  usePersistEffect(SESSION_KEY, session, { onSaveError });

  return [session, dispatch] as const;
}
