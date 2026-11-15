import { useEffect, useRef } from 'react';
import type { Question, QuestionOption, SavedExamState } from '../types';
import { displayLabel } from '../lib/format';
import { displayAnswer, sameAnswer } from '../lib/scoring';
import { OptionExplanationsPanel } from './OptionExplanationsPanel';

function scrollSessionToTop(anchor?: HTMLElement | null) {
  const scrollToTop = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    anchor?.scrollIntoView({ block: 'start', behavior: 'auto' });
  };

  scrollToTop();
  requestAnimationFrame(scrollToTop);
}

type QuestionViewProps = {
  question: Question;
  session: SavedExamState;
  selectedIds: string[];
  orderedOptions: QuestionOption[];
  isSubmitted: boolean;
  isFlagged: boolean;
  answeredCount: number;
  submittedCount: number;
  onSelect: (optionId: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onToggleFlag: () => void;
  onReview: () => void;
  onSubmitPractice: () => void;
  onFinishPractice: () => void;
  onDiscard: () => void;
  onMenu: () => void;
};

export function QuestionView({
  question,
  session,
  selectedIds,
  orderedOptions,
  isSubmitted,
  isFlagged,
  answeredCount,
  submittedCount,
  onSelect,
  onNext,
  onPrevious,
  onToggleFlag,
  onReview,
  onSubmitPractice,
  onFinishPractice,
  onDiscard,
  onMenu,
}: QuestionViewProps) {
  const questionTopRef = useRef<HTMLElement>(null);
  const isMultiAnswer = question.correctOptionIds.length > 1;
  const optionOrder = orderedOptions.map((option) => option.id);
  const totalQuestions = session.questionOrder.length;
  const questionNumber = session.currentIndex + 1;
  const canGoBack = session.currentIndex > 0;
  const canGoNext = session.currentIndex < totalQuestions - 1;
  const isPracticeComplete = session.mode === 'practice' && submittedCount === totalQuestions;
  const isCorrect = sameAnswer(selectedIds, question.correctOptionIds);
  const isAnswerLocked = session.mode === 'practice' && isSubmitted;
  const isAtSelectionLimit =
    isMultiAnswer && !isAnswerLocked && selectedIds.length >= question.correctOptionIds.length;

  useEffect(() => {
    scrollSessionToTop(questionTopRef.current);
  }, [question.id, session.currentIndex]);

  return (
    <section ref={questionTopRef} className="panel question-panel">
      <div className="session-bar">
        <div>
          <p className="eyebrow">{session.mode === 'exam' ? 'Exam mode' : 'Practice mode'}</p>
          <h2>
            Question {questionNumber} of {totalQuestions}
          </h2>
        </div>
        <div className="session-bar-actions">
          <button className="secondary-button" onClick={onMenu}>
            Menu
          </button>
          <button className="ghost-button" onClick={onDiscard}>
            Discard
          </button>
        </div>
      </div>

      <div
        className="progress-track"
        role="progressbar"
        aria-label="Session progress"
        aria-valuemin={1}
        aria-valuemax={totalQuestions}
        aria-valuenow={questionNumber}
      >
        <span style={{ width: `${(questionNumber / totalQuestions) * 100}%` }} />
      </div>

      <div className="question-meta">
        <span>{isMultiAnswer ? `Choose ${question.correctOptionIds.length}` : 'Choose one'}</span>
        <span>{session.mode === 'exam' ? `${answeredCount} answered` : `${submittedCount} submitted`}</span>
        {isFlagged && <span className="flag-label">Flagged</span>}
      </div>

      <p className="question-text">{question.question}</p>

      <div className="options-list">
        {orderedOptions.map((option, index) => {
          const isSelected = selectedIds.includes(option.id);
          const inputType = isMultiAnswer ? 'checkbox' : 'radio';
          const shouldShowAnswer = isAnswerLocked;
          const isCorrectOption = question.correctOptionIds.includes(option.id);
          const visibleLabel = displayLabel(index);

          return (
            <label
              key={option.id}
              className={[
                'option-card',
                isSelected ? 'selected' : '',
                shouldShowAnswer && isCorrectOption ? 'correct' : '',
                shouldShowAnswer && isSelected && !isCorrectOption ? 'incorrect' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <input
                type={inputType}
                name={question.id}
                checked={isSelected}
                onChange={() => onSelect(option.id)}
                disabled={shouldShowAnswer}
              />
              <span className="option-id">{visibleLabel}</span>
              <span>{option.text}</span>
            </label>
          );
        })}
      </div>

      {isAtSelectionLimit && (
        <p className="selection-hint">
          You have selected {selectedIds.length}. Deselect one to choose a different option.
        </p>
      )}

      {isAnswerLocked && (
        <div
          className={isCorrect ? 'feedback correct-feedback' : 'feedback wrong-feedback'}
          aria-live="polite"
        >
          <h3>{isCorrect ? 'Correct' : 'Incorrect'}</h3>
          <p>
            Correct answer:{' '}
            <strong>{displayAnswer(question.correctOptionIds, optionOrder)}</strong>
          </p>
          <OptionExplanationsPanel question={question} orderedOptions={orderedOptions} />
        </div>
      )}

      <div className="sticky-actions">
        <button className="secondary-button" onClick={onPrevious} disabled={!canGoBack}>
          Previous
        </button>
        {session.mode === 'exam' ? (
          <>
            <button className="secondary-button" onClick={onToggleFlag}>
              {isFlagged ? 'Unflag' : 'Flag'}
            </button>
            <button className="secondary-button" onClick={onNext} disabled={!canGoNext}>
              Next
            </button>
            <button className="primary-button" onClick={onReview}>
              Review & submit
            </button>
          </>
        ) : (
          <>
            {!isSubmitted ? (
              <button
                className="primary-button"
                onClick={onSubmitPractice}
                disabled={selectedIds.length === 0}
              >
                Submit answer
              </button>
            ) : (
              <button className="secondary-button" onClick={onNext} disabled={!canGoNext}>
                Next
              </button>
            )}
            {isPracticeComplete ? (
              <button className="primary-button" onClick={onFinishPractice}>
                Finish
              </button>
            ) : (
              submittedCount > 0 && (
                <button className="ghost-button" onClick={onFinishPractice}>
                  Finish early
                </button>
              )
            )}
          </>
        )}
      </div>
    </section>
  );
}
