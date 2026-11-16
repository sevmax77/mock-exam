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

/** The topics used in the bank, in alphabetical order. */
export function getTopics(bank: Question[]): string[] {
  return [
    ...new Set(bank.map((question) => question.topic).filter((topic) => topic !== undefined)),
  ].sort((a, b) => a.localeCompare(b));
}

export type TopicScore = {
  topic: string;
  /** Questions counted: bank questions for history stats, scored questions for one attempt. */
  questionCount: number;
  /** Answers given. For one attempt this equals `questionCount`. */
  answered: number;
  correct: number;
};

/** Percentage of answers that were correct, or null when nothing was answered. */
export function topicPercent(score: Pick<TopicScore, 'answered' | 'correct'>): number | null {
  return score.answered ? Math.round((score.correct / score.answered) * 100) : null;
}

function collectTopicScores(
  entries: Array<{ topic: string | undefined; answered: number; correct: number }>,
): TopicScore[] {
  const scores = new Map<string, TopicScore>();

  for (const { topic, answered, correct } of entries) {
    if (!topic) {
      continue;
    }

    const score = scores.get(topic) ?? { topic, questionCount: 0, answered: 0, correct: 0 };
    score.questionCount += 1;
    score.answered += answered;
    score.correct += correct;
    scores.set(topic, score);
  }

  return [...scores.values()].sort((a, b) => a.topic.localeCompare(b.topic));
}

/** How each topic in the bank has gone across the saved history. Empty when no topics are set. */
export function getTopicStats(bank: Question[], stats: Map<string, QuestionStats>): TopicScore[] {
  return collectTopicScores(
    bank.map((question) => {
      const stat = stats.get(question.id);
      return { topic: question.topic, answered: stat?.seen ?? 0, correct: stat?.correct ?? 0 };
    }),
  );
}

/** One attempt's score per topic. Questions without a topic, or deleted since, are left out. */
export function getAttemptTopicScores(
  attempt: Attempt,
  questionById: Map<string, Question>,
): TopicScore[] {
  return collectTopicScores(
    attempt.results.map((result) => ({
      topic: questionById.get(result.questionId)?.topic,
      answered: 1,
      correct: result.isCorrect ? 1 : 0,
    })),
  );
}

export type TrendPoint = { id: string; completedAt: string; percent: number };

/**
 * Scores of full exams, oldest first, for the trend chart. Practice runs and drills are left out:
 * their scores aren't comparable with an exam's.
 */
export function getExamTrend(attempts: Attempt[]): TrendPoint[] {
  return attempts
    .filter((attempt) => attempt.mode === 'exam' && !attempt.drill && attempt.totalQuestions > 0)
    .map((attempt) => ({
      id: attempt.id,
      completedAt: attempt.completedAt,
      percent: Math.round((attempt.correctCount / attempt.totalQuestions) * 100),
    }))
    .reverse();
}
