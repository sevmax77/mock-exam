import { memo, useState } from 'react';
import type { Attempt, Question, QuestionResult } from '../types';
import { formatDate } from '../lib/format';
import type { Notes } from '../lib/notes';
import { getOrderedOptions } from '../lib/questionBank';
import { attemptLabel, displayAnswer, scorePercentage, targetOutcome } from '../lib/scoring';
import { getAttemptTopicScores } from '../lib/stats';
import { FilterBar } from './FilterBar';
import { OptionExplanationsPanel } from './OptionExplanationsPanel';
import { QuestionNote } from './QuestionNote';
import { TopicScores } from './TopicScores';

type ResultFilter = 'all' | 'wrong' | 'flagged';

type ResultsViewProps = {
  attempt: Attempt;
  questionById: Map<string, Question>;
  notes: Notes;
  /** Target score as a percentage; 0 means no target. */
  targetScorePercent: number;
  /** Wrong answers of this attempt that can be retried (still in the bank). */
  retryCount: number;
  /** Flagged questions of this attempt that are still in the bank. */
  flaggedCount: number;
  /** Must keep its identity between renders, or every result card redraws on each change. */
  onNoteChange: (questionId: string, text: string) => void;
  onHome: () => void;
  onNewExam: () => void;
  onNewPractice: () => void;
  onRetryWrong: () => void;
  onPracticeFlagged: () => void;
};

function ResultHeading({
  index,
  isCorrect,
  flagged,
}: {
  index: number;
  isCorrect: boolean;
  flagged?: boolean;
}) {
  return (
    <div className="result-heading">
      <span>
        Question {index + 1}
        {flagged && <span className="flag-label">Flagged</span>}
      </span>
      <strong className={isCorrect ? 'result-correct' : 'result-wrong'}>
        {isCorrect ? 'Correct' : 'Wrong'}
      </strong>
    </div>
  );
}

type ResultCardProps = {
  result: QuestionResult;
  /** Position in the attempt, which stays the same when the list is filtered. */
  index: number;
  /** Undefined when the question was deleted from the bank since. */
  question: Question | undefined;
  note: string;
  onNoteChange: (questionId: string, text: string) => void;
};

/**
 * One question of an attempt. Memoized: a full exam shows over a hundred of these, and saving a
 * note should redraw only the card it belongs to.
 */
const ResultCard = memo(function ResultCard({
  result,
  index,
  question,
  note,
  onNoteChange,
}: ResultCardProps) {
  if (!question) {
    return (
      <article className="result-card">
        <ResultHeading index={index} isCorrect={result.isCorrect} flagged={result.flagged} />
        <p className="empty-note">This question was deleted from the question bank.</p>
      </article>
    );
  }

  const orderedOptions = getOrderedOptions(question, result.optionOrder);
  const optionOrder = orderedOptions.map((option) => option.id);

  return (
    <article className="result-card">
      <ResultHeading index={index} isCorrect={result.isCorrect} flagged={result.flagged} />
      <p>{question.question}</p>
      <p>
        Your answer: <strong>{displayAnswer(result.selectedOptionIds, optionOrder)}</strong>
      </p>
      <p>
        Correct answer: <strong>{displayAnswer(result.correctOptionIds, optionOrder)}</strong>
      </p>
      <OptionExplanationsPanel question={question} orderedOptions={orderedOptions} />
      <QuestionNote note={note} onChange={(text) => onNoteChange(question.id, text)} />
    </article>
  );
});

export function ResultsView({
  attempt,
  questionById,
  notes,
  targetScorePercent,
  retryCount,
  flaggedCount,
  onNoteChange,
  onHome,
  onNewExam,
  onNewPractice,
  onRetryWrong,
  onPracticeFlagged,
}: ResultsViewProps) {
  const [filter, setFilter] = useState<ResultFilter>('all');
  const percentage = scorePercentage(attempt);
  const outcome = targetOutcome(attempt, targetScorePercent);
  const topicScores = getAttemptTopicScores(attempt, questionById);
  // Each result keeps its position in the attempt, so numbering stays right when filtered.
  const results = attempt.results.map((result, index) => ({ result, index }));
  const shownResults = results.filter(
    ({ result }) =>
      filter === 'all' || (filter === 'wrong' ? !result.isCorrect : result.flagged === true),
  );

  return (
    <section className="panel">
      <div className="session-bar">
        <div>
          <p className="eyebrow">
            {attemptLabel(attempt)} results · {formatDate(attempt.completedAt)}
          </p>
          <h2>{percentage}% score</h2>
        </div>
        <button className="secondary-button" onClick={onHome}>
          Home
        </button>
      </div>

      {outcome && (
        <p
          className={outcome === 'reached' ? 'target-note target-reached' : 'target-note'}
          role="status"
        >
          {outcome === 'reached'
            ? `Target reached: ${percentage}% is at or above your ${targetScorePercent}% target.`
            : `Below target: ${percentage}% is under your ${targetScorePercent}% target.`}
        </p>
      )}

      <div className="summary-grid">
        <div>
          <strong>{attempt.correctCount}</strong>
          <span>correct</span>
        </div>
        <div>
          <strong>{attempt.wrongCount}</strong>
          <span>wrong</span>
        </div>
        <div>
          <strong>{attempt.totalQuestions}</strong>
          <span>total</span>
        </div>
      </div>

      {attempt.timedOut && (
        <p className="timed-out-note" role="status">
          Time ran out, so the exam was submitted automatically. Unanswered questions count as
          wrong.
        </p>
      )}

      <div className="result-actions">
        {retryCount > 0 && (
          <button className="primary-button" onClick={onRetryWrong}>
            Retry {retryCount} wrong {retryCount === 1 ? 'answer' : 'answers'}
          </button>
        )}
        {flaggedCount > 0 && (
          <button className="secondary-button" onClick={onPracticeFlagged}>
            Practice {flaggedCount} flagged
          </button>
        )}
        <button
          className={retryCount > 0 ? 'secondary-button' : 'primary-button'}
          onClick={onNewExam}
        >
          New exam
        </button>
        <button className="secondary-button" onClick={onNewPractice}>
          New practice
        </button>
      </div>

      {topicScores.length > 0 && (
        <div className="topic-panel">
          <h3>Score by topic</h3>
          <TopicScores scores={topicScores} />
        </div>
      )}

      <FilterBar
        label="Show questions"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All', count: results.length },
          { value: 'wrong', label: 'Wrong', count: attempt.wrongCount },
          {
            value: 'flagged',
            label: 'Flagged',
            count: results.filter(({ result }) => result.flagged).length,
          },
        ]}
      />

      <div className="results-list">
        {shownResults.map(({ result, index }) => (
          <ResultCard
            key={result.questionId}
            result={result}
            index={index}
            question={questionById.get(result.questionId)}
            note={notes[result.questionId] ?? ''}
            onNoteChange={onNoteChange}
          />
        ))}
      </div>

      {!shownResults.length && (
        <p className="empty-note">
          {filter === 'wrong' ? 'No wrong answers.' : 'No flagged questions.'}
        </p>
      )}
    </section>
  );
}
