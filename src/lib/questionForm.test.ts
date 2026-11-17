import { describe, expect, it } from 'vitest';
import { makeQuestion } from '../test/fixtures';
import type { AiReview } from './ai';
import {
  applyAiReviewToForm,
  assignOptionIds,
  createEmptyQuestionForm,
  formToQuestion,
  questionToForm,
  snapshotOptions,
  type QuestionFormState,
} from './questionForm';

describe('assignOptionIds', () => {
  it('keeps existing ids and gives new options the first free letters', () => {
    expect(assignOptionIds(['B', null, 'D', null], 4)).toEqual(['B', 'A', 'D', 'C']);
    expect(assignOptionIds(['A', 'B'], 3)).toEqual(['A', 'B', 'C']);
    expect(assignOptionIds([], 2)).toEqual(['A', 'B']);
  });
});

describe('questionToForm / formToQuestion', () => {
  it('round-trips a question', () => {
    const question = { ...makeQuestion('q3', ['B', 'D']), summary: 'sum' };
    expect(formToQuestion(questionToForm(question), 'unused')).toEqual(question);
  });

  it('keeps option ids after an option is removed', () => {
    const form = questionToForm(makeQuestion('q1', ['C']));
    const withoutA: QuestionFormState = {
      ...form,
      optionIds: form.optionIds.slice(1),
      optionTexts: form.optionTexts.slice(1),
      optionExplanations: form.optionExplanations.slice(1),
      correctIndexes: [1],
    };

    const question = formToQuestion(withoutA, 'unused');
    expect(question.options.map((option) => option.id)).toEqual(['B', 'C', 'D']);
    expect(question.correctOptionIds).toEqual(['C']);
  });

  it('trims text, uses the fallback id and cleans correct indexes', () => {
    const form: QuestionFormState = {
      ...createEmptyQuestionForm(),
      question: '  Q?  ',
      optionTexts: [' a ', 'b'],
      optionIds: [null, null],
      optionExplanations: [' x '],
      correctIndexes: [1, 1, 5, -1, 0],
    };

    expect(formToQuestion(form, 'q042')).toEqual({
      id: 'q042',
      question: 'Q?',
      options: [
        { id: 'A', text: 'a', explanation: 'x' },
        { id: 'B', text: 'b', explanation: '' },
      ],
      correctOptionIds: ['A', 'B'],
      summary: '',
    });
  });
});

describe('applyAiReviewToForm', () => {
  const form: QuestionFormState = {
    ...questionToForm(makeQuestion('q1', ['A'], ['one', 'two', 'three'])),
    optionExplanations: ['old A', '', 'old C'],
    summary: 'old summary',
  };
  const review: AiReview = {
    optionsSnapshot: snapshotOptions(form.optionTexts),
    recommendedOptionIds: ['B', 'C'],
    confidence: 'high',
    optionExplanations: { A: 'ai A', B: 'ai B' },
    summary: ' ai summary ',
    notes: '',
  };

  it('refuses a review made for different option texts', () => {
    const changed = { ...form, optionTexts: ['one', 'two', 'changed'] };
    expect(applyAiReviewToForm(changed, review, 'replace-all', 't')).toBeNull();
  });

  it('ignores whitespace-only option text changes', () => {
    const spaced = { ...form, optionTexts: [' one', 'two ', 'three'] };
    expect(applyAiReviewToForm(spaced, review, 'replace-explanation', 't')).not.toBeNull();
  });

  it('replace-all sets the answer and explanations, keeping ones the AI skipped', () => {
    expect(applyAiReviewToForm(form, review, 'replace-all', 't')).toMatchObject({
      correctIndexes: [1, 2],
      optionExplanations: ['ai A', 'ai B', 'old C'],
      summary: 'ai summary',
    });
  });

  it('replace-explanation keeps the answer', () => {
    expect(applyAiReviewToForm(form, review, 'replace-explanation', 't')?.correctIndexes).toEqual([
      0,
    ]);
  });

  it('merge-explanation appends stamped AI text', () => {
    const merged = applyAiReviewToForm(form, review, 'merge-explanation', 'T');
    expect(merged?.optionExplanations).toEqual(['old A\n\nAI (T): ai A', 'AI (T): ai B', 'old C']);
    expect(merged?.summary).toBe('old summary\n\nAI summary (T):\nai summary');
    expect(merged?.correctIndexes).toEqual([0]);
  });
});

describe('topic in the form', () => {
  it('round-trips, and a blank topic is not written', () => {
    const question = { ...makeQuestion('q1'), topic: 'Security' };
    const form = questionToForm(question);
    expect(form.topic).toBe('Security');
    expect(formToQuestion(form, 'unused')).toEqual(question);
    expect(formToQuestion({ ...form, topic: '  ' }, 'unused')).not.toHaveProperty('topic');
    expect(createEmptyQuestionForm().topic).toBe('');
  });
});
