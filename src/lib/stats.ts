import type { Attempt, Question } from '../types';

/** What the saved history says about one question. */
export type QuestionStats = {
  /** Times the question was scored. */
  seen: number;
  /** Times it was answered correctly. */
  correct: number;
  /** Result of the most recent time it was answered. */
  lastCorrect: boolean;
  /** Whether it was flagged the most recent time it was answered. */
  lastFlagged: boolean;
  /** Completion time of the most recent attempt that included it. */
  lastSeenAt: string;
};

/** Number of questions in a focus session when the session size setting is "all". */
export const DEFAULT_FOCUS_SESSION_SIZE = 20;

/**
 * Per-question stats from the saved history. Attempts are stored newest first, so the first
 * result seen for a question is its latest one. Map order is most recently answered first.
 */
export function getQuestionStats(attempts: Attempt[]): Map<string, QuestionStats> {
  const stats = new Map<string, QuestionStats>();

  for (const attempt of attempts) {
    for (const result of attempt.results ?? []) {
      const existing = stats.get(result.questionId);

      if (existing) {
        existing.seen += 1;
        existing.correct += result.isCorrect ? 1 : 0;
      } else {
        stats.set(result.questionId, {
          seen: 1,
          correct: result.isCorrect ? 1 : 0,
          lastCorrect: result.isCorrect,
          lastFlagged: result.flagged === true,
          lastSeenAt: attempt.completedAt,
        });
      }
    }
  }

  return stats;
}

/**
 * Questions whose most recent result was wrong, most recently answered first.
 * Questions answered correctly later, or deleted from the bank, are left out.
 */
export function getMistakeQuestionIds(
  stats: Map<string, QuestionStats>,
  questionById: Map<string, Question>,
): string[] {
  return [...stats]
    .filter(([questionId, stat]) => !stat.lastCorrect && questionById.has(questionId))
    .map(([questionId]) => questionId);
}

/** Questions that were flagged the most recent time they were answered. */
export function getFlaggedQuestionIds(
  stats: Map<string, QuestionStats>,
  questionById: Map<string, Question>,
): string[] {
  return [...stats]
    .filter(([questionId, stat]) => stat.lastFlagged && questionById.has(questionId))
    .map(([questionId]) => questionId);
}

/**
 * How likely a question is to be answered wrong, from 0 to 1, with one imagined right and one
 * imagined wrong answer added so a single result doesn't decide everything. Unanswered questions
 * score 0.5: above anything answered right more often than wrong, below anything answered wrong
 * more often than right.
 */
export function weakness(stat: QuestionStats | undefined): number {
  if (!stat) {
    return 0.5;
  }

  return (stat.seen - stat.correct + 1) / (stat.seen + 2);
}

/**
 * Bank questions sorted weakest first. Ties go to the question practiced least recently
 * (unanswered first), then to bank order.
 */
export function sortByWeakness(bank: Question[], stats: Map<string, QuestionStats>): Question[] {
  return bank
    .map((question, index) => ({ question, index, stat: stats.get(question.id) }))
    .sort(
      (a, b) =>
        weakness(b.stat) - weakness(a.stat) ||
        (a.stat?.lastSeenAt ?? '').localeCompare(b.stat?.lastSeenAt ?? '') ||
        a.index - b.index,
    )
    .map(({ question }) => question);
}

/** The `count` weakest questions in the bank. */
export function getWeakQuestionIds(
  bank: Question[],
  stats: Map<string, QuestionStats>,
  count: number,
): string[] {
  return sortByWeakness(bank, stats)
    .slice(0, count)
    .map((question) => question.id);
}
