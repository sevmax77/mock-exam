import type { Attempt, Question, SavedExamState, SessionMode } from '../types';
import { getScore } from './scoring';
import { orderItems } from './shuffle';

export const MAX_SAVED_ATTEMPTS = 20;

export type ExamSettings = {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
};

export const DEFAULT_EXAM_SETTINGS: ExamSettings = {
  shuffleQuestions: true,
  shuffleOptions: true,
};

export function createSession(
  mode: SessionMode,
  questions: Question[],
  examSettings: ExamSettings,
  now: Date = new Date(),
): SavedExamState {
  const questionOrder = orderItems(
    questions.map((question) => question.id),
    examSettings.shuffleQuestions,
  );
  const optionOrders = Object.fromEntries(
    questions.map((question) => [
      question.id,
      orderItems(
        question.options.map((option) => option.id),
        examSettings.shuffleOptions,
      ),
    ]),
  );

  return {
    mode,
    startedAt: now.toISOString(),
    questionOrder,
    optionOrders,
    currentIndex: 0,
    selections: {},
    submittedQuestionIds: [],
    flaggedQuestionIds: [],
  };
}

/**
 * Makes a saved session consistent with the current question bank instead of discarding it:
 * drops deleted questions and options, appends newly added options, and keeps the current
 * question selected when it still exists. Returns null when nothing usable is left.
 */
export function reconcileSession(
  session: SavedExamState | null,
  questionById: Map<string, Question>,
): SavedExamState | null {
  if (!session || !Array.isArray(session.questionOrder)) {
    return null;
  }

  const questionOrder = session.questionOrder.filter((id) => questionById.has(id));

  if (!questionOrder.length) {
    return null;
  }

  const optionOrders: Record<string, string[]> = {};
  const selections: Record<string, string[]> = {};

  for (const questionId of questionOrder) {
    const question = questionById.get(questionId)!;
    const validIds = question.options.map((option) => option.id);
    const validSet = new Set(validIds);
    const keptOrder = (session.optionOrders?.[questionId] ?? []).filter((id) => validSet.has(id));
    optionOrders[questionId] = [...keptOrder, ...validIds.filter((id) => !keptOrder.includes(id))];

    const selected = (session.selections?.[questionId] ?? []).filter((id) => validSet.has(id));
    if (selected.length) {
      selections[questionId] = selected;
    }
  }

  const kept = new Set(questionOrder);
  const previousCurrentId = session.questionOrder[session.currentIndex];
  const currentIndex = kept.has(previousCurrentId)
    ? questionOrder.indexOf(previousCurrentId)
    : Math.min(Math.max(session.currentIndex ?? 0, 0), questionOrder.length - 1);

  return {
    ...session,
    questionOrder,
    optionOrders,
    selections,
    currentIndex,
    submittedQuestionIds: (session.submittedQuestionIds ?? []).filter((id) => kept.has(id)),
    flaggedQuestionIds: (session.flaggedQuestionIds ?? []).filter((id) => kept.has(id)),
  };
}

export type SessionAction =
  | { type: 'start'; session: SavedExamState }
  | { type: 'clear' }
  | { type: 'select'; question: Question; optionId: string }
  | { type: 'submit'; questionId: string }
  | { type: 'goTo'; index: number }
  | { type: 'move'; direction: -1 | 1 }
  | { type: 'toggleFlag'; questionId: string }
  | { type: 'reconcile'; questionById: Map<string, Question> };

/**
 * All session changes go through here, so every update starts from the latest state.
 * Returns the same object when an action changes nothing.
 */
export function sessionReducer(
  session: SavedExamState | null,
  action: SessionAction,
): SavedExamState | null {
  switch (action.type) {
    case 'start':
      return action.session;
    case 'clear':
      return null;
    case 'reconcile':
      return reconcileSession(session, action.questionById);
  }

  if (!session) {
    return session;
  }

  switch (action.type) {
    case 'select': {
      const { question, optionId } = action;

      if (session.mode === 'practice' && session.submittedQuestionIds.includes(question.id)) {
        return session;
      }

      const current = session.selections[question.id] ?? [];
      const maxSelections = question.correctOptionIds.length;
      let nextSelection: string[];

      if (maxSelections > 1) {
        if (current.includes(optionId)) {
          nextSelection = current.filter((id) => id !== optionId);
        } else if (current.length >= maxSelections) {
          return session;
        } else {
          nextSelection = [...current, optionId];
        }
      } else {
        nextSelection = [optionId];
      }

      return {
        ...session,
        selections: { ...session.selections, [question.id]: nextSelection },
      };
    }

    case 'submit': {
      const { questionId } = action;
      if (
        !(session.selections[questionId] ?? []).length ||
        session.submittedQuestionIds.includes(questionId)
      ) {
        return session;
      }

      return { ...session, submittedQuestionIds: [...session.submittedQuestionIds, questionId] };
    }

    case 'goTo':
    case 'move': {
      const target = action.type === 'goTo' ? action.index : session.currentIndex + action.direction;
      const currentIndex = Math.min(Math.max(target, 0), session.questionOrder.length - 1);
      return currentIndex === session.currentIndex ? session : { ...session, currentIndex };
    }

    case 'toggleFlag': {
      const { questionId } = action;
      const flaggedQuestionIds = session.flaggedQuestionIds.includes(questionId)
        ? session.flaggedQuestionIds.filter((id) => id !== questionId)
        : [...session.flaggedQuestionIds, questionId];
      return { ...session, flaggedQuestionIds };
    }
  }
}

/** Questions that count towards the score: all of them in exam mode, submitted ones in practice. */
export function getScoredQuestionIds(session: SavedExamState): string[] {
  if (session.mode === 'exam') {
    return session.questionOrder;
  }

  const submitted = new Set(session.submittedQuestionIds);
  return session.questionOrder.filter((id) => submitted.has(id));
}

export function buildAttempt(
  session: SavedExamState,
  questionById: Map<string, Question>,
  scoredIds: string[],
  now: Date = new Date(),
): Attempt {
  const score = getScore(session, questionById, scoredIds);

  return {
    id: `${now.getTime()}`,
    mode: session.mode,
    startedAt: session.startedAt,
    completedAt: now.toISOString(),
    totalQuestions: scoredIds.length,
    correctCount: score.correctCount,
    wrongCount: score.wrongCount,
    results: score.results,
  };
}

export function countAnswered(session: SavedExamState): number {
  return session.questionOrder.filter((id) => (session.selections[id] ?? []).length > 0).length;
}
