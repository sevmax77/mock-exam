import type { Question, SavedExamState } from '../types';
import { truncate } from '../lib/format';

type ReviewViewProps = {
  session: SavedExamState;
  questionById: Map<string, Question>;
  answeredCount: number;
  onGoToQuestion: (index: number) => void;
  onBack: () => void;
  onSubmit: () => void;
};

export function ReviewView({
  session,
  questionById,
  answeredCount,
  onGoToQuestion,
  onBack,
  onSubmit,
}: ReviewViewProps) {
  const flaggedIds = new Set(session.flaggedQuestionIds);
  const unanswered = session.questionOrder.length - answeredCount;

  return (
    <section className="panel">
      <div className="session-bar">
        <div>
          <p className="eyebrow">Final review</p>
          <h2>Review before submission</h2>
        </div>
        <button className="secondary-button" onClick={onBack}>
          Back to exam
        </button>
      </div>

      <div className="summary-grid">
        <div>
          <strong>{answeredCount}</strong>
          <span>answered</span>
        </div>
        <div>
          <strong>{unanswered}</strong>
          <span>unanswered</span>
        </div>
        <div>
          <strong>{session.flaggedQuestionIds.length}</strong>
          <span>flagged</span>
        </div>
      </div>

      <div className="review-list">
        {session.questionOrder.map((questionId, index) => {
          const question = questionById.get(questionId);
          const selected = session.selections[questionId] ?? [];
          const status = selected.length > 0 ? 'Answered' : 'Unanswered';

          return (
            <button key={questionId} className="review-item" onClick={() => onGoToQuestion(index)}>
              <span>Question {index + 1}</span>
              <strong>{status}</strong>
              {flaggedIds.has(questionId) && <em>Flagged</em>}
              <small>{truncate(question?.question ?? '', 130)}</small>
            </button>
          );
        })}
      </div>

      <div className="sticky-actions">
        <button className="secondary-button" onClick={onBack}>
          Keep reviewing
        </button>
        <button className="primary-button" onClick={onSubmit}>
          Submit final answers
        </button>
      </div>
    </section>
  );
}
