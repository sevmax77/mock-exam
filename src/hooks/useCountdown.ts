import { useEffect, useRef, useState } from 'react';

/**
 * Milliseconds left until `deadline` (an ISO time), updated every second, or null when there is
 * no deadline. Calls `onExpire` once the deadline has passed, including after a reload.
 */
export function useCountdown(deadline: string | undefined, onExpire: () => void): number | null {
  const [now, setNow] = useState(() => Date.now());
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  });

  useEffect(() => {
    if (!deadline) {
      return;
    }

    const end = Date.parse(deadline);
    let expired = false;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= end && !expired) {
        expired = true;
        onExpireRef.current();
      }
    };

    // The first tick runs right away so a stale `now` is never shown for a new deadline.
    const first = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [deadline]);

  return deadline ? Date.parse(deadline) - now : null;
}
