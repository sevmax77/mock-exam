import type { Attempt, Question } from '../types';
import { formatDate, truncate } from '../lib/format';
import { attemptLabel, scorePercentage, targetOutcome } from '../lib/scoring';
import { MAX_SAVED_ATTEMPTS, MAX_SAVED_DRILLS } from '../lib/session';
import type { TrendPoint } from '../lib/stats';
import { ScoreTrend } from './ScoreTrend';

type HistoryProps = {
  attempts: Attempt[];
  questionById: Map<string, Question>;
  /** Full exams, oldest first, for the trend chart. */
  trend: TrendPoint[];
  /** Target score as a percentage; 0 means no target. */
  targetScorePercent: number;
  onView: (attempt: Attempt) => void;
  onClear: () => void;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
};

function ImportButton({ onImport }: { onImport: (file: File) => Promise<void> }) {
  return (
    <label className="secondary-button file-button">
      Import backup
      <input
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void onImport(file);
            event.target.value = '';
          }
        }}
      />
    </label>
  );
}

export function History({
  attempts,
  questionById,
  trend,
  targetScorePercent,
  onView,
  onClear,
  onExport,
  onImport,
}: HistoryProps) {
  if (!attempts.length) {
    return (
      <section className="panel">
        <h2>Saved history</h2>
        <p>No completed attempts yet. Your results will be saved on this device.</p>
        <div className="history-actions">
          <ImportButton onImport={onImport} />
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="session-bar">
        <div>
          <p className="eyebrow">Saved on this device</p>
          <h2>Attempt history</h2>
        </div>
        <div className="history-actions">
          <button className="secondary-button" onClick={onExport}>
            Export backup
          </button>
          <ImportButton onImport={onImport} />
          <button className="ghost-button" onClick={onClear}>
            Clear history
          </button>
        </div>
      </div>

      <ScoreTrend
        points={trend}
        targetPercent={targetScorePercent}
        onOpen={(attemptId) => {
          const attempt = attempts.find((item) => item.id === attemptId);
          if (attempt) {
            onView(attempt);
          }
        }}
      />

      <div className="history-list">
        {attempts.map((attempt) => {
          const wrongQuestions = attempt.results.filter((result) => !result.isCorrect);
          const percentage = scorePercentage(attempt);
          const outcome = targetOutcome(attempt, targetScorePercent);

          return (
            <details key={attempt.id} className="history-item">
              <summary>
                <span>
                  {attemptLabel(attempt)} - {formatDate(attempt.completedAt)}
                </span>
                <strong>
                  {percentage}%
                  {outcome && (
                    <span
                      className={
                        outcome === 'reached' ? 'target-chip target-reached' : 'target-chip'
                      }
                    >
                      {outcome === 'reached' ? 'Target reached' : 'Below target'}
                    </span>
                  )}
                </strong>
              </summary>
              <p>
                Correct {attempt.correctCount}, wrong {attempt.wrongCount}, total{' '}
                {attempt.totalQuestions}.{attempt.timedOut && ' Time ran out.'}
              </p>
              <button className="secondary-button" onClick={() => onView(attempt)}>
                View answers and explanations
              </button>
              {wrongQuestions.length > 0 && (
                <ul>
                  {wrongQuestions.map((result) => {
                    const question = questionById.get(result.questionId);
                    return (
                      <li key={result.questionId}>
                        {question ? truncate(question.question, 160) : '(question deleted)'}
                      </li>
                    );
                  })}
                </ul>
              )}
            </details>
          );
        })}
      </div>

      <p className="field-hint history-note">
        The newest {MAX_SAVED_ATTEMPTS} full exams and practice runs are kept, plus the newest{' '}
        {MAX_SAVED_DRILLS} drills (retries, mistakes, flagged, focus and topic practice). Drills
        never push full sessions out.
      </p>
    </section>
  );
}
