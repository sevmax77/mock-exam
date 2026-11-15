import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { removeStoredKey, saveJson } from '../lib/storage';

export type PersistOptions<T> = {
  /** What to write; defaults to the value itself. Return null to remove the key instead. */
  serialize?: (value: T) => unknown;
  /** Called when the browser refuses the write (quota full, private mode, ...). */
  onSaveError?: () => void;
  /** Called after each successful write. */
  onSaved?: () => void;
};

/** Writes `value` to localStorage under `key` whenever it changes. A null value removes the key. */
export function usePersistEffect<T>(key: string, value: T, options: PersistOptions<T> = {}) {
  // Callbacks change identity every render; read the latest ones without re-running the effect.
  // This effect is declared first, so it runs before the save effect below.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  useEffect(() => {
    const { serialize, onSaveError, onSaved } = optionsRef.current;
    const stored = serialize ? serialize(value) : value;

    if (stored === null || stored === undefined) {
      removeStoredKey(key);
    } else if (saveJson(key, stored)) {
      onSaved?.();
    } else {
      onSaveError?.();
    }
  }, [key, value]);
}

/** `useState` whose value is loaded from and saved to localStorage. */
export function usePersistentState<T>(
  key: string,
  load: () => T,
  options: PersistOptions<T> = {},
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(load);
  usePersistEffect(key, value, options);
  return [value, setValue];
}
