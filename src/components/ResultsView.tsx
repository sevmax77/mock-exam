import type { Attempt, Question } from '../types';
import { getOrderedOptions } from '../lib/questionBank';
import { displayAnswer, scorePercentage } from '../lib/scoring';
import { OptionExplanationsPanel } from './OptionExplanationsPanel';

type ResultsViewProps = {
  attempt: Attempt;
  questionById: Map<string, Question>;
  /** Wrong answers of this attempt that can be retried (still in the bank). */
  retryCount: number;
  /** Flagged questions of this attempt that are still in the bank. */
  flaggedCount: number;
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

export function ResultsView({
  attempt,
  questionById,
  retryCount,
  flaggedCount,
  onHome,
  onNewExam,
  onNewPractice,
  onRetryWrong,
  onPracticeFlagged,
}: ResultsViewProps) {
  const percentage = scorePercentage(attempt);

  return (
    <section className="panel">
      <div className="session-bar">
        <div>
          <p className="eyebrow">Results</p>
          <h2>{percentage}% score</h2>
        </div>
        <button className="secondary-button" onClick={onHome}>
          Home
        </button>
      </div>

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

      <div className="results-list">
        {attempt.results.map((result, index) => {
          const question = questionById.get(result.questionId);

          if (!question) {
            return (
              <article key={result.questionId} className="result-card">
                <ResultHeading
                  index={index}
                  isCorrect={result.isCorrect}
                  flagged={result.flagged}
                />
                <p className="empty-note">This question was deleted from the question bank.</p>
              </article>
            );
          }

          const orderedOptions = getOrderedOptions(question, result.optionOrder);
          const optionOrder = orderedOptions.map((option) => option.id);

          return (
            <article key={result.questionId} className="result-card">
              <ResultHeading index={index} isCorrect={result.isCorrect} flagged={result.flagged} />
              <p>{question.question}</p>
              <p>
                Your answer: <strong>{displayAnswer(result.selectedOptionIds, optionOrder)}</strong>
              </p>
              <p>
                Correct answer:{' '}
                <strong>{displayAnswer(result.correctOptionIds, optionOrder)}</strong>
              </p>
              <OptionExplanationsPanel question={question} orderedOptions={orderedOptions} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
