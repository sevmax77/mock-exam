import type { Question } from '../types';
import { truncate } from '../lib/format';
import type { BatchState } from '../hooks/useBatchAskAi';

type BatchAskAiPanelProps = {
  /** Questions with empty or placeholder explanations. */
  pendingCount: number;
  batch: BatchState | null;
  questionById: Map<string, Question>;
  onStart: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  onEdit: (question: Question) => void;
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

export function BatchAskAiPanel({
  pendingCount,
  batch,
  questionById,
  onStart,
  onCancel,
  onDismiss,
  onEdit,
}: BatchAskAiPanelProps) {
  if (!batch && !pendingCount) {
    return null;
  }

  const outcomes = batch?.outcomes ?? [];
  const agreed = outcomes.filter((outcome) => outcome.status === 'agreed').length;
  const disagreed = outcomes.filter((outcome) => outcome.status === 'disagreed');
  const failed = outcomes.filter((outcome) => outcome.status === 'failed');

  return (
    <section className="ai-panel batch-panel" aria-live="polite">
      <div className="form-section-heading">
        <div>
          <h3>Fill missing explanations with Ask AI</h3>
          <p>
            {batch?.running
              ? `Reviewing question ${Math.min(outcomes.length + 1, batch.total)} of ${batch.total}...`
              : pendingCount
                ? `${plural(pendingCount, 'question')} ${pendingCount === 1 ? 'has' : 'have'} empty or placeholder explanations. Explanations are only filled in where the AI agrees with your answer key; answers are never changed.`
                : 'All questions have explanations now.'}
          </p>
        </div>
        {batch?.running ? (
          <button className="secondary-button" onClick={onCancel}>
            Cancel
          </button>
        ) : (
          pendingCount > 0 && (
            <button className="primary-button" onClick={onStart}>
              Fill {plural(pendingCount, 'question')}
            </button>
          )
        )}
      </div>

      {batch && (
        <>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="Batch Ask AI progress"
            aria-valuemin={0}
            aria-valuemax={batch.total}
            aria-valuenow={outcomes.length}
          >
            <span style={{ width: `${batch.total ? (outcomes.length / batch.total) * 100 : 0}%` }} />
          </div>

          <p className="ai-meta">
            Filled {agreed} · AI disagreed on {disagreed.length} · failed {failed.length}
            {batch.stopReason && ` · ${batch.stopReason}`}
          </p>

          {disagreed.length > 0 && (
            <div className="batch-list">
              <h4>Check these answer keys</h4>
              <p className="field-hint">
                The AI picked a different answer, so nothing was changed. Open the question and use
                Ask AI there to compare.
              </p>
              <ul>
                {disagreed.map((outcome) => {
                  const question = questionById.get(outcome.questionId);
                  return (
                    <li key={outcome.questionId}>
                      <span>
                        <strong>{outcome.questionId}</strong> · key {outcome.current.join(', ')}, AI{' '}
                        {outcome.recommended.join(', ')}
                        {question && ` · ${truncate(question.question, 90)}`}
                      </span>
                      {question && (
                        <button className="secondary-button" onClick={() => onEdit(question)}>
                          Open
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {failed.length > 0 && (
            <div className="batch-list">
              <h4>Failed</h4>
              <ul>
                {failed.map((outcome) => (
                  <li key={outcome.questionId}>
                    <span>
                      <strong>{outcome.questionId}</strong> · {truncate(outcome.error, 160)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!batch.running && (
            <button className="ghost-button" onClick={onDismiss}>
              Hide report
            </button>
          )}
        </>
      )}
    </section>
  );
}
