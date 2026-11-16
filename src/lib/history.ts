import type { Attempt, QuestionResult } from '../types';
import { normalizeNotes, type Notes } from './notes';
import { MAX_SAVED_ATTEMPTS, MAX_SAVED_DRILLS } from './session';

export const HISTORY_BACKUP_FORMAT = 'mock-exam-history';

export type HistoryBackup = {
  format: typeof HISTORY_BACKUP_FORMAT;
  version: 1;
  exportedAt: string;
  attempts: Attempt[];
  /** Personal notes by question id. Absent in backups made before notes existed. */
  notes?: Notes;
};

export function createHistoryBackup(
  attempts: Attempt[],
  notes: Notes = {},
  now: Date = new Date(),
): HistoryBackup {
  return {
    format: HISTORY_BACKUP_FORMAT,
    version: 1,
    exportedAt: now.toISOString(),
    attempts,
    ...(Object.keys(notes).length ? { notes } : {}),
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
    ...(value.drill === true ? { drill: true } : {}),
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
 * no usable attempts or notes; `skipped` counts the entries that couldn't be read.
 */
export function parseHistoryBackup(data: unknown): {
  attempts: Attempt[];
  notes: Notes;
  skipped: number;
} {
  let entries: unknown[];
  let notes: Notes = {};

  if (Array.isArray(data)) {
    entries = data;
  } else if (
    isRecord(data) &&
    data.format === HISTORY_BACKUP_FORMAT &&
    Array.isArray(data.attempts)
  ) {
    entries = data.attempts;
    notes = normalizeNotes(data.notes);
  } else {
    throw new Error('This file is not a Mock Exam history backup.');
  }

  const attempts = normalizeStoredAttempts(entries);

  if (!attempts.length && !Object.keys(notes).length) {
    throw new Error('The backup has no attempts that can be imported.');
  }

  return { attempts, notes, skipped: entries.length - attempts.length };
}

/**
 * Applies the history caps to attempts sorted newest first: the newest `maxFull` full sessions
 * and the newest `maxDrills` drills are kept. The two are counted separately, so short drills
 * never push full exams (and the per-question stats they carry) out of the history.
 */
export function pruneAttempts(
  attempts: Attempt[],
  maxFull: number = MAX_SAVED_ATTEMPTS,
  maxDrills: number = MAX_SAVED_DRILLS,
): Attempt[] {
  let full = 0;
  let drills = 0;

  return attempts.filter((attempt) =>
    attempt.drill ? (drills += 1) <= maxDrills : (full += 1) <= maxFull,
  );
}

/** Adds a just-finished attempt to the front of the history and applies the caps. */
export function addAttempt(attempts: Attempt[], attempt: Attempt): Attempt[] {
  return pruneAttempts([attempt, ...attempts]);
}

/**
 * Adds imported attempts to the history, skipping ones already there, and applies the history
 * caps. Returns the merged history (newest first) and how many imported attempts made it in.
 */
export function mergeAttempts(
  existing: Attempt[],
  imported: Attempt[],
  maxFull: number = MAX_SAVED_ATTEMPTS,
  maxDrills: number = MAX_SAVED_DRILLS,
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
  const attempts = pruneAttempts(
    [...existing, ...fresh].sort((a, b) => b.completedAt.localeCompare(a.completedAt)),
    maxFull,
    maxDrills,
  );

  return {
    attempts,
    added: attempts.filter((attempt) => freshIds.has(attempt.id)).length,
  };
}
