import { useState } from 'react';
import type { Question, SavedExamState } from '../types';
import { truncate } from '../lib/format';
import { FilterBar } from './FilterBar';
import { TimerBadge } from './TimerBadge';

type ReviewFilter = 'all' | 'unanswered' | 'flagged';

type ReviewViewProps = {
  session: SavedExamState;
  questionById: Map<string, Question>;
  answeredCount: number;
  remainingMs: number | null;
  onGoToQuestion: (index: number) => void;
  onBack: () => void;
  onSubmit: () => void;
};

export function ReviewView({
  session,
  questionById,
  answeredCount,
  remainingMs,
  onGoToQuestion,
  onBack,
  onSubmit,
}: ReviewViewProps) {
  const [filter, setFilter] = useState<ReviewFilter>('all');
  const flaggedIds = new Set(session.flaggedQuestionIds);
  const unanswered = session.questionOrder.length - answeredCount;
  // Each item keeps its position in the session, so its number and the jump stay right when the
  // list is filtered.
  const items = session.questionOrder.map((questionId, index) => ({
    questionId,
    index,
    answered: (session.selections[questionId] ?? []).length > 0,
    flagged: flaggedIds.has(questionId),
  }));
  const shownItems = items.filter(
    (item) => filter === 'all' || (filter === 'unanswered' ? !item.answered : item.flagged),
  );

  return (
    <section className="panel">
      <div className="session-bar">
        <div>
          <p className="eyebrow">Final review</p>
          <h2>Review before submission</h2>
        </div>
        <div className="session-bar-actions">
          <TimerBadge remainingMs={remainingMs} />
          <button className="secondary-button" onClick={onBack}>
            Back to exam
          </button>
        </div>
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

      <FilterBar
        label="Show questions"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All', count: items.length },
          { value: 'unanswered', label: 'Unanswered', count: unanswered },
          { value: 'flagged', label: 'Flagged', count: session.flaggedQuestionIds.length },
        ]}
      />

      <div className="review-list">
        {shownItems.map(({ questionId, index, answered, flagged }) => (
          <button key={questionId} className="review-item" onClick={() => onGoToQuestion(index)}>
            <span>Question {index + 1}</span>
            <strong>{answered ? 'Answered' : 'Unanswered'}</strong>
            {flagged && <em>Flagged</em>}
            <small>{truncate(questionById.get(questionId)?.question ?? '', 130)}</small>
          </button>
        ))}
      </div>

      {!shownItems.length && (
        <p className="empty-note">
          {filter === 'unanswered' ? 'Every question is answered.' : 'No flagged questions.'}
        </p>
      )}

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
