import { describe, expect, it } from 'vitest';
import type { Attempt } from '../types';
import {
  HISTORY_BACKUP_FORMAT,
  createHistoryBackup,
  mergeAttempts,
  normalizeAttempt,
  normalizeStoredAttempts,
  parseHistoryBackup,
} from './history';

const attempt = (id: string, completedAt: string, correct = [true, false]): Attempt => ({
  id,
  mode: 'exam',
  startedAt: completedAt,
  completedAt,
  totalQuestions: correct.length,
  correctCount: correct.filter(Boolean).length,
  wrongCount: correct.filter((value) => !value).length,
  results: correct.map((isCorrect, index) => ({
    questionId: `q${index + 1}`,
    optionOrder: ['A', 'B'],
    selectedOptionIds: ['A'],
    correctOptionIds: [isCorrect ? 'A' : 'B'],
    isCorrect,
  })),
});

const older = attempt('1', '2026-03-01T00:00:00.000Z');
const newer = attempt('2', '2026-03-02T00:00:00.000Z');
const newest = attempt('3', '2026-03-03T00:00:00.000Z');

describe('normalizeAttempt', () => {
  it('keeps valid attempts unchanged', () => {
    expect(normalizeAttempt(older)).toEqual(older);
    expect(normalizeAttempt({ ...older, timedOut: true })).toHaveProperty('timedOut', true);
  });

  it('recomputes counts from the results and drops unknown fields', () => {
    const tampered = { ...older, correctCount: 99, totalQuestions: 1, extra: 'x' };
    expect(normalizeAttempt(tampered)).toEqual(older);
  });

  it('keeps the flagged marker on results', () => {
    const flagged = { ...older, results: [{ ...older.results[0], flagged: true }] };
    expect(normalizeAttempt(flagged)?.results[0].flagged).toBe(true);
  });

  it('rejects broken attempts', () => {
    expect(normalizeAttempt(null)).toBeNull();
    expect(normalizeAttempt({ ...older, mode: 'quiz' })).toBeNull();
    expect(normalizeAttempt({ ...older, completedAt: 'yesterday' })).toBeNull();
    expect(normalizeAttempt({ ...older, results: [{ questionId: 'q1' }] })).toBeNull();
  });

  it('drops unreadable stored attempts', () => {
    expect(normalizeStoredAttempts([older, { id: 5 }, newer])).toEqual([older, newer]);
    expect(normalizeStoredAttempts('nope')).toEqual([]);
  });
});

describe('parseHistoryBackup', () => {
  it('reads a backup made by createHistoryBackup', () => {
    const backup = createHistoryBackup([newer, older], new Date('2026-03-05T00:00:00Z'));
    expect(backup).toMatchObject({ format: HISTORY_BACKUP_FORMAT, version: 1 });
    // Round-trip through JSON like a real file.
    expect(parseHistoryBackup(JSON.parse(JSON.stringify(backup)))).toEqual({
      attempts: [newer, older],
      skipped: 0,
    });
  });

  it('accepts a bare array and counts skipped entries', () => {
    expect(parseHistoryBackup([older, 'junk'])).toEqual({ attempts: [older], skipped: 1 });
  });

  it('rejects files that are not history backups', () => {
    expect(() => parseHistoryBackup({ questions: [] })).toThrow(/not a Mock Exam history backup/);
    expect(() => parseHistoryBackup([{ id: 'x' }])).toThrow(/no attempts/);
  });
});

describe('mergeAttempts', () => {
  it('adds new attempts, skips duplicates and sorts newest first', () => {
    expect(mergeAttempts([newer], [older, newer, newest], 10)).toEqual({
      attempts: [newest, newer, older],
      added: 2,
    });
  });

  it('keeps only the newest attempts and counts only the imported ones that fit', () => {
    expect(mergeAttempts([newest, newer], [older], 2)).toEqual({
      attempts: [newest, newer],
      added: 0,
    });
  });
});
