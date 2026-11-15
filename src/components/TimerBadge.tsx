import { formatDuration } from '../lib/format';

const LOW_TIME_MS = 5 * 60_000;

/** Time left in a timed exam. Turns to a warning style in the last five minutes. */
export function TimerBadge({ remainingMs }: { remainingMs: number | null }) {
  if (remainingMs === null) {
    return null;
  }

  return (
    <span
      className={remainingMs <= LOW_TIME_MS ? 'timer-badge timer-badge-low' : 'timer-badge'}
      role="timer"
      aria-label={`Time left ${formatDuration(remainingMs)}`}
    >
      {formatDuration(remainingMs)}
    </span>
  );
}
