import type { Question, QuestionOption } from '../types';
import type { AiReview } from './ai';
import { displayLabel } from './format';

export type QuestionFormState = {
  id?: string;
  /** Canonical option ids, by form position. `null` for options added in this edit. */
  optionIds: Array<string | null>;
  question: string;
  optionTexts: string[];
  optionExplanations: string[];
  correctIndexes: number[];
  summary: string;
};

export type ApplyAiReviewMode = 'replace-all' | 'replace-explanation' | 'merge-explanation';

export function createEmptyQuestionForm(): QuestionFormState {
  return {
    optionIds: [null, null, null, null],
    question: '',
    optionTexts: ['', '', '', ''],
    optionExplanations: ['', '', '', ''],
    correctIndexes: [],
    summary: '',
  };
}

export function questionToForm(question: Question): QuestionFormState {
  return {
    id: question.id,
    optionIds: question.options.map((option) => option.id),
    question: question.question,
    optionTexts: question.options.map((option) => option.text),
    optionExplanations: question.options.map((option) => option.explanation ?? ''),
    correctIndexes: question.correctOptionIds
      .map((id) => question.options.findIndex((option) => option.id === id))
      .filter((index) => index >= 0),
    summary: question.summary ?? '',
  };
}

/**
 * Existing options keep their id, so saved sessions and attempt history keep pointing at the same
 * option text after an edit. New options get the first free letter.
 */
export function assignOptionIds(optionIds: Array<string | null>, count: number): string[] {
  const used = new Set(optionIds.filter((id): id is string => Boolean(id)));
  let nextLetter = 0;

  return Array.from({ length: count }, (_, index) => {
    const existing = optionIds[index];
    if (existing) {
      return existing;
    }

    while (used.has(displayLabel(nextLetter))) {
      nextLetter += 1;
    }

    const id = displayLabel(nextLetter);
    used.add(id);
    return id;
  });
}

export function formToQuestion(form: QuestionFormState, fallbackId: string): Question {
  const optionIds = assignOptionIds(form.optionIds, form.optionTexts.length);
  const options = form.optionTexts.map<QuestionOption>((text, index) => ({
    id: optionIds[index],
    text: text.trim(),
    explanation: form.optionExplanations[index]?.trim() ?? '',
  }));

  return {
    id: form.id ?? fallbackId,
    question: form.question.trim(),
    options,
    correctOptionIds: [...new Set(form.correctIndexes)]
      .filter((index) => index >= 0 && index < options.length)
      .sort((a, b) => a - b)
      .map((index) => options[index].id),
    summary: form.summary.trim(),
  };
}

export function snapshotOptions(optionTexts: string[]): string {
  return JSON.stringify(optionTexts.map((text) => text.trim()));
}

/**
 * Applies an AI review to the form. The review uses positional labels (A = first option in the
 * form, ...). Returns null when the option texts changed since the review was requested.
 */
export function applyAiReviewToForm(
  form: QuestionFormState,
  review: AiReview,
  mode: ApplyAiReviewMode,
  timestamp: string,
): QuestionFormState | null {
  if (review.optionsSnapshot !== snapshotOptions(form.optionTexts)) {
    return null;
  }

  const optionExplanations = form.optionTexts.map((_, index) => {
    const aiText = review.optionExplanations[displayLabel(index)]?.trim() ?? '';
    const currentText = form.optionExplanations[index]?.trim() ?? '';

    if (mode === 'merge-explanation') {
      return [currentText, aiText && `AI (${timestamp}): ${aiText}`].filter(Boolean).join('\n\n');
    }

    return aiText || currentText;
  });
  const summary =
    mode === 'merge-explanation'
      ? [
          form.summary.trim(),
          review.summary.trim() && `AI summary (${timestamp}):\n${review.summary.trim()}`,
        ]
          .filter(Boolean)
          .join('\n\n')
      : review.summary.trim();
  const correctIndexes =
    mode === 'replace-all'
      ? review.recommendedOptionIds
          .map((label) => label.charCodeAt(0) - 65)
          .filter((index) => index >= 0 && index < form.optionTexts.length)
      : form.correctIndexes;

  return { ...form, correctIndexes, optionExplanations, summary };
}
