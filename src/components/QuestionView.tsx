import { useEffect, useEffectEvent, useRef } from 'react';
import type { Question, QuestionOption, SavedExamState } from '../types';
import { displayLabel } from '../lib/format';
import { displayAnswer, sameAnswer } from '../lib/scoring';
import { OptionExplanationsPanel } from './OptionExplanationsPanel';
import { QuestionNote } from './QuestionNote';
import { TimerBadge } from './TimerBadge';

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

/** True when a key press should go to a text field or control rather than to the shortcuts. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (
    target.isContentEditable ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  ) {
    return true;
  }

  return (
    target instanceof HTMLInputElement && target.type !== 'radio' && target.type !== 'checkbox'
  );
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
  remainingMs: number | null;
  /** The user's note on this question; shown once a practice answer is submitted. */
  note: string;
  onNoteChange: (text: string) => void;
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
  remainingMs,
  note,
  onNoteChange,
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

  const canSubmit = session.mode === 'practice' && !isSubmitted && selectedIds.length > 0;
  // In practice, Next only appears after the answer is submitted; the keys follow the buttons.
  const canMoveNext = canGoNext && (session.mode === 'exam' || isSubmitted);

  useEffect(() => {
    scrollSessionToTop(questionTopRef.current);
  }, [question.id, session.currentIndex]);

  // Desktop shortcuts: 1-9 select, left/right move, F flags, Enter submits or moves on.
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (
      event.repeat ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      isTypingTarget(event.target) ||
      // An open dialog (such as "Discard this session?") gets the keys, not the question behind.
      document.querySelector('dialog[open]')
    ) {
      return;
    }

    const optionIndex = /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : -1;
    let handled = true;

    if (optionIndex >= 0 && optionIndex < orderedOptions.length) {
      onSelect(orderedOptions[optionIndex].id);
    } else if (event.key === 'ArrowLeft' && canGoBack) {
      onPrevious();
    } else if (event.key === 'ArrowRight' && canMoveNext) {
      onNext();
    } else if (event.key === 'f' || event.key === 'F') {
      onToggleFlag();
    } else if (event.key === 'Enter' && !(event.target instanceof HTMLButtonElement)) {
      if (canSubmit) {
        onSubmitPractice();
      } else if (canMoveNext) {
        onNext();
      } else {
        handled = false;
      }
    } else {
      // Arrow keys on a focused radio button would otherwise change the selection.
      handled = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
    }

    if (handled) {
      event.preventDefault();
    }
  });

  useEffect(() => {
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

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
          <TimerBadge remainingMs={remainingMs} />
          <button className="secondary-button" onClick={onMenu}>
            Menu
          </button>
          <button className="ghost-button" onClick={onDiscard}>
            Discard
          </button>
        </div>
      </div>

      <progress
        className="progress-bar"
        aria-label="Session progress"
        max={totalQuestions}
        value={questionNumber}
      />

      <div className="question-meta">
        <span>{isMultiAnswer ? `Choose ${question.correctOptionIds.length}` : 'Choose one'}</span>
        <span>
          {session.mode === 'exam' ? `${answeredCount} answered` : `${submittedCount} submitted`}
        </span>
        {question.topic && <span>{question.topic}</span>}
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
            Correct answer: <strong>{displayAnswer(question.correctOptionIds, optionOrder)}</strong>
          </p>
          <OptionExplanationsPanel question={question} orderedOptions={orderedOptions} />
          <QuestionNote key={question.id} note={note} onChange={onNoteChange} />
        </div>
      )}

      <p className="keyboard-hint">
        Keys: 1–{Math.min(orderedOptions.length, 9)} choose · ← → move · F flag · Enter{' '}
        {session.mode === 'practice' ? 'submit / next' : 'next'}
      </p>

      <div className="sticky-actions">
        <button className="secondary-button" onClick={onPrevious} disabled={!canGoBack}>
          Previous
        </button>
        <button className="secondary-button" onClick={onToggleFlag} aria-pressed={isFlagged}>
          {isFlagged ? 'Unflag' : 'Flag'}
        </button>
        {session.mode === 'exam' ? (
          <>
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
              <button className="primary-button" onClick={onSubmitPractice} disabled={!canSubmit}>
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
