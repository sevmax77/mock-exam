import { useEffect, useRef } from 'react';

/**
 * A ref that always holds the value from the latest render. Handlers that wait for a dialog read
 * it after the dialog closes: the session or bank may have changed while the dialog was open (a
 * timed exam running out, Batch Ask AI filling in explanations).
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  });

  return ref;
}
