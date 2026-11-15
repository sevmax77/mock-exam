import type { Attempt, QuestionResult } from '../types';

export const HISTORY_BACKUP_FORMAT = 'mock-exam-history';

export type HistoryBackup = {
  format: typeof HISTORY_BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  attempts: Attempt[];
};

export function createHistoryBackup(attempts: Attempt[], now: Date = new Date()): HistoryBackup {
  return {
    format: HISTORY_BACKUP_FORMAT,
    version: 1,
    exportedAt: now.toISOString(),
    attempts,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function normalizeResult(value: unknown): QuestionResult | null {
  if (
    !isRecord(value) ||
    typeof value.questionId !== 'string' ||
    !isStringArray(value.selectedOptionIds) ||
    !isStringArray(value.correctOptionIds) ||
    typeof value.isCorrect !== 'boolean'
  ) {
    return null;
  }

  return {
    questionId: value.questionId,
    ...(isStringArray(value.optionOrder) ? { optionOrder: value.optionOrder } : {}),
    selectedOptionIds: value.selectedOptionIds,
    correctOptionIds: value.correctOptionIds,
    isCorrect: value.isCorrect,
    ...(value.flagged === true ? { flagged: true } : {}),
  };
}

/** A valid attempt with only the known fields, or null. Counts are recomputed from the results. */
export function normalizeAttempt(value: unknown): Attempt | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    (value.mode !== 'exam' && value.mode !== 'practice') ||
    typeof value.completedAt !== 'string' ||
    Number.isNaN(Date.parse(value.completedAt)) ||
    !Array.isArray(value.results)
  ) {
    return null;
  }

  const results = value.results.map(normalizeResult);

  if (results.some((result) => result === null)) {
    return null;
  }

  const valid = results as QuestionResult[];
  const correctCount = valid.filter((result) => result.isCorrect).length;

  return {
    id: value.id,
    mode: value.mode,
    startedAt: typeof value.startedAt === 'string' ? value.startedAt : value.completedAt,
    completedAt: value.completedAt,
    totalQuestions: valid.length,
    correctCount,
    wrongCount: valid.length - correctCount,
    results: valid,
    ...(value.timedOut === true ? { timedOut: true } : {}),
  };
}

/** Attempts loaded from storage, with anything unreadable dropped. */
export function normalizeStoredAttempts(value: unknown): Attempt[] {
  return Array.isArray(value)
    ? value.map(normalizeAttempt).filter((attempt): attempt is Attempt => attempt !== null)
    : [];
}

/**
 * Reads a history backup file. Also accepts a bare array of attempts. Throws when the file has
 * no usable attempts; `skipped` counts the entries that couldn't be read.
 */
export function parseHistoryBackup(data: unknown): { attempts: Attempt[]; skipped: number } {
  let entries: unknown[];

  if (Array.isArray(data)) {
    entries = data;
  } else if (isRecord(data) && data.format === HISTORY_BACKUP_FORMAT && Array.isArray(data.attempts)) {
    entries = data.attempts;
  } else {
    throw new Error('This file is not a Mock Exam history backup.');
  }

  const attempts = normalizeStoredAttempts(entries);

  if (!attempts.length) {
    throw new Error('The backup has no attempts that can be imported.');
  }

  return { attempts, skipped: entries.length - attempts.length };
}

/**
 * Adds imported attempts to the history, skipping ones already there, and keeps the newest `max`.
 * Returns the merged history (newest first) and how many imported attempts made it in.
 */
export function mergeAttempts(
  existing: Attempt[],
  imported: Attempt[],
  max: number,
): { attempts: Attempt[]; added: number } {
  const known = new Set(existing.map((attempt) => attempt.id));
  const fresh: Attempt[] = [];

  for (const attempt of imported) {
    if (!known.has(attempt.id)) {
      known.add(attempt.id);
      fresh.push(attempt);
    }
  }

  const freshIds = new Set(fresh.map((attempt) => attempt.id));
  const attempts = [...existing, ...fresh]
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, max);

  return {
    attempts,
    added: attempts.filter((attempt) => freshIds.has(attempt.id)).length,
  };
}
