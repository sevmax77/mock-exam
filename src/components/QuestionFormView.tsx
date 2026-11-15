import { useMemo } from 'react';
import { DEFAULT_AI_MODEL, type AiReview, type AiSettings, type AiStatus } from '../lib/ai';
import { displayLabel } from '../lib/format';
import { getQuestionWarnings } from '../lib/questionBank';
import { formToQuestion, type ApplyAiReviewMode, type QuestionFormState } from '../lib/questionForm';

type QuestionFormViewProps = {
  form: QuestionFormState;
  errors: string[];
  warnings: string[];
  aiSettings: AiSettings;
  aiStatus: AiStatus;
  aiReview: AiReview | null;
  onChange: (form: QuestionFormState) => void;
  onCancel: () => void;
  onSave: (form: QuestionFormState) => void;
  onDelete?: (questionId: string) => void;
  onAskAi: () => void;
  onApplyAiReview: (mode: ApplyAiReviewMode) => void;
  onDismissAiReview: () => void;
  onOpenAiSettings: () => void;
};

export function QuestionFormView({
  form,
  errors,
  warnings,
  aiSettings,
  aiStatus,
  aiReview,
  onChange,
  onCancel,
  onSave,
  onDelete,
  onAskAi,
  onApplyAiReview,
  onDismissAiReview,
  onOpenAiSettings,
}: QuestionFormViewProps) {
  const previewQuestion = useMemo(
    () => formToQuestion({ ...form, id: form.id ?? 'preview' }, 'preview'),
    [form],
  );
  const liveWarnings = useMemo(() => getQuestionWarnings(previewQuestion), [previewQuestion]);
  const displayWarnings = warnings.length ? warnings : liveWarnings;

  const updateOptionText = (index: number, text: string) => {
    const optionTexts = [...form.optionTexts];
    optionTexts[index] = text;
    onChange({ ...form, optionTexts });
  };

  const updateOptionExplanation = (index: number, explanation: string) => {
    const optionExplanations = [...form.optionExplanations];
    optionExplanations[index] = explanation;
    onChange({ ...form, optionExplanations });
  };

  const toggleCorrect = (index: number) => {
    const correctIndexes = form.correctIndexes.includes(index)
      ? form.correctIndexes.filter((currentIndex) => currentIndex !== index)
      : [...form.correctIndexes, index];
    onChange({ ...form, correctIndexes });
  };

  const addOption = () => {
    onChange({
      ...form,
      optionIds: [...form.optionIds, null],
      optionTexts: [...form.optionTexts, ''],
      optionExplanations: [...form.optionExplanations, ''],
    });
  };

  const removeOption = (index: number) => {
    if (form.optionTexts.length <= 2) {
      return;
    }

    const optionIds = form.optionIds.filter((_, currentIndex) => currentIndex !== index);
    const optionTexts = form.optionTexts.filter((_, currentIndex) => currentIndex !== index);
    const optionExplanations = form.optionExplanations.filter(
      (_, currentIndex) => currentIndex !== index,
    );
    const correctIndexes = form.correctIndexes
      .filter((currentIndex) => currentIndex !== index)
      .map((currentIndex) => (currentIndex > index ? currentIndex - 1 : currentIndex));
    onChange({ ...form, optionIds, optionTexts, optionExplanations, correctIndexes });
  };

  return (
    <section className="panel">
      <div className="session-bar">
        <div>
          <p className="eyebrow">{form.id ? 'Edit question' : 'Add question'}</p>
          <h2>{form.id ? 'Update question' : 'Create a new question'}</h2>
        </div>
        <button className="secondary-button" onClick={onCancel}>
          Back to bank
        </button>
      </div>

      {errors.length > 0 && (
        <div className="form-errors">
          <strong>Please fix these items:</strong>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {displayWarnings.length > 0 && (
        <div className="form-warnings">
          <strong>Warnings:</strong>
          <ul>
            {displayWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="question-form">
        <label className="form-field">
          <span>Question</span>
          <textarea
            value={form.question}
            rows={7}
            onChange={(event) => onChange({ ...form, question: event.target.value })}
            placeholder="Paste or type the question text"
          />
        </label>

        <div className="form-section-heading">
          <div>
            <h3>Answer options and explanations</h3>
            <p>
              Each option has its own explanation. Explanations stay attached to the option even
              when answers are shuffled during a session.
            </p>
          </div>
          <button className="secondary-button" onClick={addOption}>
            Add option
          </button>
        </div>

        <div className="editable-options">
          {form.optionTexts.map((text, index) => (
            <div className="editable-option" key={`${displayLabel(index)}-${index}`}>
              <label className="correct-toggle">
                <input
                  type="checkbox"
                  checked={form.correctIndexes.includes(index)}
                  onChange={() => toggleCorrect(index)}
                />
                Correct
              </label>
              <div className="editable-option-fields">
                <label className="form-field">
                  <span>Option {displayLabel(index)} text</span>
                  <textarea
                    value={text}
                    rows={3}
                    onChange={(event) => updateOptionText(index, event.target.value)}
                    placeholder={`Option ${displayLabel(index)} text`}
                  />
                </label>
                <label className="form-field">
                  <span>
                    Option {displayLabel(index)} explanation
                    {form.correctIndexes.includes(index) ? ' (why correct)' : ' (why incorrect)'}
                  </span>
                  <textarea
                    value={form.optionExplanations[index] ?? ''}
                    rows={4}
                    onChange={(event) => updateOptionExplanation(index, event.target.value)}
                    placeholder={
                      form.correctIndexes.includes(index)
                        ? 'Explain why this option is correct.'
                        : 'Explain why this option is not correct or is weaker.'
                    }
                  />
                </label>
              </div>
              <button
                className="ghost-button danger-button"
                onClick={() => removeOption(index)}
                disabled={form.optionTexts.length <= 2}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <label className="form-field">
          <span>Overall summary (optional)</span>
          <textarea
            value={form.summary}
            rows={5}
            onChange={(event) => onChange({ ...form, summary: event.target.value })}
            placeholder="Optional conclusion, multi-answer combination note, or references."
          />
        </label>

        <section className="ai-panel">
          <div className="form-section-heading">
            <div>
              <h3>Ask AI</h3>
              <p>
                Send this question to OpenRouter for an AWS AIP-C01 focused answer review with
                per-option explanations.
              </p>
            </div>
            <button className="secondary-button" onClick={onOpenAiSettings}>
              AI settings
            </button>
          </div>

          <p className="ai-meta">
            Model: <strong>{aiSettings.model || DEFAULT_AI_MODEL}</strong>
            {aiSettings.apiKey ? ' · API key saved locally' : ' · API key not set'}
          </p>

          {aiStatus.error && <div className="form-errors">{aiStatus.error}</div>}

          <button className="primary-button" onClick={onAskAi} disabled={aiStatus.loading}>
            {aiStatus.loading ? 'Asking AI...' : 'Ask AI'}
          </button>

          {aiReview && (
            <article className="ai-review-card">
              <div className="result-heading">
                <div>
                  <p className="eyebrow">AI recommendation</p>
                  <h3>{aiReview.recommendedOptionIds.join(', ')}</h3>
                </div>
                <strong>Confidence: {aiReview.confidence}</strong>
              </div>
              {aiReview.notes && <p>{aiReview.notes}</p>}
              <div className="option-explanations-list">
                {form.optionTexts.map((_, index) => {
                  const optionId = displayLabel(index);
                  const explanation = aiReview.optionExplanations[optionId];
                  if (!explanation) {
                    return null;
                  }

                  return (
                    <article key={optionId} className="option-explanation-card">
                      <div className="option-explanation-heading">
                        <span className="option-id">{optionId}</span>
                        <strong>AI explanation</strong>
                      </div>
                      <p className="explanation">{explanation}</p>
                    </article>
                  );
                })}
              </div>
              {aiReview.summary.trim() && (
                <div className="question-summary">
                  <h4>AI summary</h4>
                  <p className="explanation">{aiReview.summary}</p>
                </div>
              )}
              <div className="result-actions">
                <button className="primary-button" onClick={() => onApplyAiReview('replace-all')}>
                  Replace answer + explanations
                </button>
                <button
                  className="secondary-button"
                  onClick={() => onApplyAiReview('replace-explanation')}
                >
                  Replace explanations only
                </button>
                <button
                  className="secondary-button"
                  onClick={() => onApplyAiReview('merge-explanation')}
                >
                  Merge explanations
                </button>
                <button className="ghost-button" onClick={onDismissAiReview}>
                  Dismiss
                </button>
              </div>
            </article>
          )}
        </section>
      </div>

      <div className="sticky-actions">
        {form.id && onDelete && (
          <button className="ghost-button danger-button" onClick={() => onDelete(form.id!)}>
            Delete question
          </button>
        )}
        <button className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" onClick={() => onSave(form)}>
          Save question
        </button>
      </div>
    </section>
  );
}
