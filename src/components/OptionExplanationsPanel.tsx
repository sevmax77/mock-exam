import type { Question, QuestionOption } from '../types';
import { displayLabel } from '../lib/format';

type OptionExplanationsPanelProps = {
  question: Question;
  orderedOptions: QuestionOption[];
};

export function OptionExplanationsPanel({ question, orderedOptions }: OptionExplanationsPanelProps) {
  const correctSet = new Set(question.correctOptionIds);

  return (
    <div className="option-explanations-panel">
      <h3>Answer explanations</h3>
      <div className="option-explanations-list">
        {orderedOptions.map((option, index) => (
          <article
            key={option.id}
            className={[
              'option-explanation-card',
              correctSet.has(option.id) ? 'correct' : 'incorrect-option',
            ].join(' ')}
          >
            <div className="option-explanation-heading">
              <span className="option-id">{displayLabel(index)}</span>
              <strong>{correctSet.has(option.id) ? 'Correct' : 'Incorrect'}</strong>
            </div>
            <p className="option-explanation-text">{option.text}</p>
            <p className="explanation">{option.explanation}</p>
          </article>
        ))}
      </div>
      {question.summary.trim() && (
        <div className="question-summary">
          <h4>Summary</h4>
          <p className="explanation">{question.summary}</p>
        </div>
      )}
    </div>
  );
}
