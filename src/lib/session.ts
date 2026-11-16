import type { Attempt, Question, SavedExamState, SessionMode } from '../types';
import { getScore } from './scoring';
import { orderItems, shuffle } from './shuffle';

/**
 * History is capped to stay well inside the browser's storage quota. A full 127-question attempt
 * takes about 15 KB, so 50 attempts stay under 1 MB.
 */
export const MAX_SAVED_ATTEMPTS = 50;

/**
 * Drills (sessions over chosen questions) have their own cap, so a run of short drills never
 * pushes full exams and practice runs out of the history.
 */
export const MAX_SAVED_DRILLS = 50;

export const DEFAULT_TARGET_SCORE_PERCENT = 75;

export type ExamSettings = {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  /** Questions per session, picked at random. 0 means the whole bank. */
  questionCount: number;
  /** Exam mode time limit in minutes. 0 means untimed. Practice is never timed. */
  timeLimitMinutes: number;
  /**
   * The score to aim for in exam mode, as a percentage of questions answered correctly. 0 turns
   * the target off. It is a personal target, not the real exam's (often scaled) passing score.
   */
  targetScorePercent: number;
};

export const DEFAULT_EXAM_SETTINGS: ExamSettings = {
  shuffleQuestions: true,
  shuffleOptions: true,
  questionCount: 0,
  timeLimitMinutes: 0,
  targetScorePercent: DEFAULT_TARGET_SCORE_PERCENT,
};

/** Fills in defaults and repairs invalid numbers in settings loaded from storage. */
export function normalizeExamSettings(stored: Partial<ExamSettings> | null): ExamSettings {
  const settings = {
    ...DEFAULT_EXAM_SETTINGS,
    ...(stored && typeof stored === 'object' ? stored : {}),
  };
  const wholeNumber = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;

  return {
    shuffleQuestions: settings.shuffleQuestions !== false,
    shuffleOptions: settings.shuffleOptions !== false,
    questionCount: wholeNumber(settings.questionCount),
    timeLimitMinutes: wholeNumber(settings.timeLimitMinutes),
    // 0 is a valid choice here (no target), so only a missing or invalid value gets the default.
    targetScorePercent:
      typeof settings.targetScorePercent === 'number' &&
      Number.isFinite(settings.targetScorePercent) &&
      settings.targetScorePercent >= 0
        ? Math.min(100, Math.floor(settings.targetScorePercent))
        : DEFAULT_TARGET_SCORE_PERCENT,
  };
}

export function createSession(
  mode: SessionMode,
  bank: Question[],
  examSettings: ExamSettings,
  now: Date = new Date(),
  drill = false,
): SavedExamState {
  // A smaller session is a random sample; it keeps bank order unless questions are shuffled.
  const { questionCount, timeLimitMinutes } = examSettings;
  const sampledIds =
    questionCount > 0 && questionCount < bank.length
      ? new Set(shuffle(bank.map((question) => question.id)).slice(0, questionCount))
      : null;
  const questions = sampledIds ? bank.filter((question) => sampledIds.has(question.id)) : bank;

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
    ...(mode === 'exam' && timeLimitMinutes > 0
      ? { deadline: new Date(now.getTime() + timeLimitMinutes * 60_000).toISOString() }
      : {}),
    ...(drill ? { drill: true } : {}),
  };
}

/** Wrong answers of one attempt that still exist in the bank. */
export function getWrongQuestionIds(
  attempt: Attempt,
  questionById: Map<string, Question>,
): string[] {
  return attempt.results
    .filter((result) => !result.isCorrect && questionById.has(result.questionId))
    .map((result) => result.questionId);
}

/** Flagged questions of one attempt that still exist in the bank. */
export function getFlaggedResultIds(
  attempt: Attempt,
  questionById: Map<string, Question>,
): string[] {
  return attempt.results
    .filter((result) => result.flagged && questionById.has(result.questionId))
    .map((result) => result.questionId);
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
      const target =
        action.type === 'goTo' ? action.index : session.currentIndex + action.direction;
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
  timedOut = false,
): Attempt {
  const score = getScore(session, questionById, scoredIds);
  const flagged = new Set(session.flaggedQuestionIds);
  const results = score.results.map((result) =>
    flagged.has(result.questionId) ? { ...result, flagged: true } : result,
  );

  return {
    id: `${now.getTime()}`,
    mode: session.mode,
    startedAt: session.startedAt,
    completedAt: now.toISOString(),
    totalQuestions: scoredIds.length,
    correctCount: score.correctCount,
    wrongCount: score.wrongCount,
    results,
    ...(timedOut ? { timedOut: true } : {}),
    ...(session.drill ? { drill: true } : {}),
  };
}

export function countAnswered(session: SavedExamState): number {
  return session.questionOrder.filter((id) => (session.selections[id] ?? []).length > 0).length;
}
