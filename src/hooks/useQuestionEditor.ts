import { useState } from 'react';
import type { Question } from '../types';
import type { AiSettings } from '../lib/ai';
import { createNextQuestionId, getQuestionWarnings, validateQuestion } from '../lib/questionBank';
import {
  applyAiReviewToForm,
  createEmptyQuestionForm,
  formToQuestion,
  snapshotOptions,
  type ApplyAiReviewMode,
  type QuestionFormState,
} from '../lib/questionForm';
import type { Screen } from '../lib/routing';
import { useAskAi } from './useAskAi';

type QuestionEditorOptions = {
  questionBank: Question[];
  aiSettings: AiSettings;
  saveQuestionBank: (questions: Question[]) => void;
  navigate: (to: Screen) => void;
  goBack: (to: Screen) => void;
  openSettings: (returnTo: Screen) => void;
};

/** The add/edit question form: its draft, validation messages, and the Ask AI review for it. */
export function useQuestionEditor({
  questionBank,
  aiSettings,
  saveQuestionBank,
  navigate,
  goBack,
  openSettings,
}: QuestionEditorOptions) {
  const [form, setForm] = useState<QuestionFormState>(createEmptyQuestionForm);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const ai = useAskAi();

  const open = (next: QuestionFormState) => {
    ai.cancel();
    setForm(next);
    setErrors([]);
    setWarnings([]);
    navigate('question-form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const close = () => {
    ai.cancel();
    goBack('bank');
  };

  const save = (saved: QuestionFormState) => {
    const nextQuestion = formToQuestion(saved, saved.id ?? createNextQuestionId(questionBank));
    const nextErrors = validateQuestion(nextQuestion);

    setErrors(nextErrors);
    setWarnings(getQuestionWarnings(nextQuestion));

    if (nextErrors.length) {
      return;
    }

    saveQuestionBank(
      saved.id
        ? questionBank.map((question) => (question.id === saved.id ? nextQuestion : question))
        : [...questionBank, nextQuestion],
    );
    close();
  };

  const askAi = () => {
    if (!aiSettings.apiKey.trim()) {
      ai.setError('Add your OpenRouter API key in AI Settings first.');
      openSettings('question-form');
      return;
    }

    const candidateQuestion = formToQuestion(form, form.id ?? createNextQuestionId(questionBank));
    const requiredErrors = validateQuestion(candidateQuestion);

    if (requiredErrors.length) {
      setErrors(requiredErrors);
      return;
    }

    setErrors([]);
    void ai.ask(candidateQuestion, aiSettings, snapshotOptions(form.optionTexts));
  };

  const applyAiReview = (mode: ApplyAiReviewMode) => {
    if (!ai.review) {
      return;
    }

    const next = applyAiReviewToForm(form, ai.review, mode, new Date().toLocaleString());

    if (!next) {
      window.alert(
        'The answer options changed after this AI review. Ask AI again before applying.',
      );
      return;
    }

    setForm(next);
  };

  return {
    form,
    setForm,
    errors,
    warnings,
    aiStatus: ai.status,
    aiReview: ai.review,
    dismissAiReview: ai.dismissReview,
    open,
    close,
    save,
    askAi,
    applyAiReview,
  };
}
