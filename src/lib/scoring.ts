import type { Attempt, Question, QuestionResult, SavedExamState } from '../types';
import { displayLabel } from './format';

export function sameAnswer(selectedIds: string[], correctIds: string[]): boolean {
  if (selectedIds.length !== correctIds.length) {
    return false;
  }

  const selected = [...selectedIds].sort();
  const correct = [...correctIds].sort();
  return selected.every((id, index) => id === correct[index]);
}

/** Display letters for the given option ids, as positioned in `optionOrder` ("A, C"). */
export function displayAnswer(optionIds: string[], optionOrder: string[]): string {
  if (!optionIds.length) {
    return 'No answer';
  }

  return optionIds
    .map((optionId) => optionOrder.indexOf(optionId))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)
    .map(displayLabel)
    .join(', ');
}

export function getScore(
  session: SavedExamState,
  questionById: Map<string, Question>,
  questionIds: string[] = session.questionOrder,
): { results: QuestionResult[]; correctCount: number; wrongCount: number } {
  const results = questionIds.map((questionId) => {
    const question = questionById.get(questionId);
    const selectedOptionIds = session.selections[questionId] ?? [];
    const correctOptionIds = question?.correctOptionIds ?? [];

    return {
      questionId,
      optionOrder:
        session.optionOrders[questionId] ?? question?.options.map((option) => option.id) ?? [],
      selectedOptionIds,
      correctOptionIds,
      isCorrect: sameAnswer(selectedOptionIds, correctOptionIds),
    };
  });

  return {
    results,
    correctCount: results.filter((result) => result.isCorrect).length,
    wrongCount: results.filter((result) => !result.isCorrect).length,
  };
}

export function scorePercentage(attempt: Attempt): number {
  return attempt.totalQuestions
    ? Math.round((attempt.correctCount / attempt.totalQuestions) * 100)
    : 0;
}

/** "Exam", "Practice" or "Drill", as shown in the history and on results. */
export function attemptLabel(attempt: Attempt): string {
  return attempt.drill ? 'Drill' : attempt.mode === 'exam' ? 'Exam' : 'Practice';
}

/**
 * Whether a full exam reached the target score. Null when there is no target, or for practice
 * runs and drills, which aren't measured against it.
 */
export function targetOutcome(
  attempt: Attempt,
  targetScorePercent: number,
): 'reached' | 'missed' | null {
  if (targetScorePercent <= 0 || attempt.mode !== 'exam' || attempt.drill) {
    return null;
  }

  return scorePercentage(attempt) >= targetScorePercent ? 'reached' : 'missed';
}
