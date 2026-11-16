import { formatDate } from '../lib/format';
import type { TrendPoint } from '../lib/stats';

/** The chart shows at most this many exams, the most recent ones. */
const MAX_POINTS = 20;
const GRID_PERCENTS = [0, 50, 100];

type ScoreTrendProps = {
  /** Full exams, oldest first. */
  points: TrendPoint[];
  /** Target score as a percentage; 0 hides the target line. */
  targetPercent: number;
  onOpen: (attemptId: string) => void;
};

/**
 * Exam scores over time as a line, with the target score as a dashed line. Lines are drawn in a
 * stretched SVG; labels and points are HTML placed by percentage, so text and dots keep their
 * size at any width. Each point is a button that opens that exam's results.
 */
export function ScoreTrend({ points, targetPercent, onOpen }: ScoreTrendProps) {
  const shown = points.slice(-MAX_POINTS);

  if (shown.length < 2) {
    return null;
  }

  const xOf = (index: number) => (index / (shown.length - 1)) * 100;
  const yOf = (percent: number) => 100 - percent;
  const last = shown[shown.length - 1];

  return (
    <figure className="score-trend">
      <figcaption>
        Exam scores, {shown.length === points.length ? 'all' : 'last'} {shown.length} exams
      </figcaption>
      <div className="trend-plot">
        {GRID_PERCENTS.map((percent) => (
          <span key={percent} className="trend-axis-label" style={{ top: `${yOf(percent)}%` }}>
            {percent}%
          </span>
        ))}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {GRID_PERCENTS.map((percent) => (
            <line
              key={percent}
              className="trend-grid"
              x1="0"
              x2="100"
              y1={yOf(percent)}
              y2={yOf(percent)}
            />
          ))}
          {targetPercent > 0 && (
            <line
              className="trend-target"
              x1="0"
              x2="100"
              y1={yOf(targetPercent)}
              y2={yOf(targetPercent)}
            />
          )}
          <polyline
            className="trend-line"
            points={shown.map((point, index) => `${xOf(index)},${yOf(point.percent)}`).join(' ')}
          />
        </svg>
        {targetPercent > 0 && (
          <span className="trend-target-label" style={{ top: `${yOf(targetPercent)}%` }}>
            Target {targetPercent}%
          </span>
        )}
        {shown.map((point, index) => (
          <button
            key={point.id}
            type="button"
            className={xOf(index) > 50 ? 'trend-point trend-point-right' : 'trend-point'}
            style={{ left: `${xOf(index)}%`, top: `${yOf(point.percent)}%` }}
            aria-label={`${point.percent}% on ${formatDate(point.completedAt)}. Open results.`}
            onClick={() => onOpen(point.id)}
          >
            <span className="trend-dot" />
            <span className="trend-tip" aria-hidden="true">
              <strong>{point.percent}%</strong> {formatDate(point.completedAt)}
            </span>
          </button>
        ))}
        <span className="trend-last-label" style={{ top: `${yOf(last.percent)}%` }}>
          {last.percent}%
        </span>
      </div>
    </figure>
  );
}
