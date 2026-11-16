import { describe, expect, it } from 'vitest';
import type { Attempt, QuestionResult } from '../types';
import { makeQuestion } from '../test/fixtures';
import { buildQuestionMap } from './questionBank';
import {
  getAttemptTopicScores,
  getExamTrend,
  getFlaggedQuestionIds,
  getMistakeQuestionIds,
  getQuestionStats,
  getTopicStats,
  getTopics,
  getWeakQuestionIds,
  sortByWeakness,
  topicPercent,
  weakness,
} from './stats';

const bank = ['q1', 'q2', 'q3', 'q4'].map((id) => makeQuestion(id));
const questionById = buildQuestionMap(bank);

const result = (questionId: string, isCorrect: boolean, flagged = false): QuestionResult => ({
  questionId,
  selectedOptionIds: [],
  correctOptionIds: [],
  isCorrect,
  ...(flagged ? { flagged } : {}),
});

const attempt = (completedAt: string, results: QuestionResult[]): Attempt => ({
  id: completedAt,
  mode: 'exam',
  startedAt: completedAt,
  completedAt,
  totalQuestions: results.length,
  correctCount: 0,
  wrongCount: 0,
  results,
});

// Stored newest first, like the app does.
const attempts = [
  attempt('2026-03-03T00:00:00.000Z', [result('q2', true), result('q3', false, true)]),
  attempt('2026-03-02T00:00:00.000Z', [
    result('q1', false),
    result('q2', false, true),
    result('q9', false),
  ]),
  attempt('2026-03-01T00:00:00.000Z', [result('q1', true), result('q2', false)]),
];

describe('getQuestionStats', () => {
  it('counts results and keeps the latest result per question', () => {
    const stats = getQuestionStats(attempts);

    expect(stats.get('q2')).toEqual({
      seen: 3,
      correct: 1,
      lastCorrect: true,
      lastFlagged: false,
      lastSeenAt: '2026-03-03T00:00:00.000Z',
    });
    expect(stats.get('q1')).toMatchObject({ seen: 2, correct: 1, lastCorrect: false });
    expect(stats.get('q3')).toMatchObject({ seen: 1, lastFlagged: true });
    expect(stats.has('q4')).toBe(false);
  });

  it('returns nothing for an empty history', () => {
    expect(getQuestionStats([]).size).toBe(0);
  });
});

describe('mistakes and flags', () => {
  const stats = getQuestionStats(attempts);

  it('lists questions whose latest result was wrong, most recent first', () => {
    // q2 was fixed in the newest attempt; q9 is no longer in the bank.
    expect(getMistakeQuestionIds(stats, questionById)).toEqual(['q3', 'q1']);
  });

  it('lists questions flagged the last time they were answered', () => {
    // q2 was flagged once, but not the last time it was answered.
    expect(getFlaggedQuestionIds(stats, questionById)).toEqual(['q3']);
  });
});

describe('weakness', () => {
  it('ranks unanswered questions between mostly wrong and mostly right ones', () => {
    const stat = (seen: number, correct: number) => ({
      seen,
      correct,
      lastCorrect: true,
      lastFlagged: false,
      lastSeenAt: '',
    });

    expect(weakness(undefined)).toBe(0.5);
    expect(weakness(stat(1, 0))).toBeGreaterThan(0.5);
    expect(weakness(stat(1, 1))).toBeLessThan(0.5);
    expect(weakness(stat(4, 2))).toBe(0.5);
    // More evidence of getting it wrong makes a question weaker.
    expect(weakness(stat(3, 0))).toBeGreaterThan(weakness(stat(1, 0)));
  });

  it('sorts weakest first, then least recently answered, then bank order', () => {
    const stats = getQuestionStats(attempts);
    // q3: 0 of 1 (0.67), q1: 1 of 2 (0.5, seen), q4: unanswered (0.5), q2: 1 of 3 (0.6).
    expect(sortByWeakness(bank, stats).map((question) => question.id)).toEqual([
      'q3',
      'q2',
      'q4',
      'q1',
    ]);
    expect(getWeakQuestionIds(bank, stats, 2)).toEqual(['q3', 'q2']);
  });

  it('keeps bank order when there is no history', () => {
    expect(getWeakQuestionIds(bank, new Map(), 10)).toEqual(['q1', 'q2', 'q3', 'q4']);
  });
});

describe('topics', () => {
  const topicBank = [
    { ...makeQuestion('q1'), topic: 'Security' },
    { ...makeQuestion('q2'), topic: 'Security' },
    { ...makeQuestion('q3'), topic: 'Cost' },
    makeQuestion('q4'),
  ];
  const run = attempt('2026-03-01T00:00:00.000Z', [
    result('q1', true),
    result('q2', false),
    result('q4', true),
    result('gone', true),
  ]);

  it('lists the topics in use', () => {
    expect(getTopics(topicBank)).toEqual(['Cost', 'Security']);
    expect(getTopics(bank)).toEqual([]);
  });

  it('scores each topic across the history', () => {
    const scores = getTopicStats(topicBank, getQuestionStats([run, run]));
    expect(scores).toEqual([
      { topic: 'Cost', questionCount: 1, answered: 0, correct: 0 },
      { topic: 'Security', questionCount: 2, answered: 4, correct: 2 },
    ]);
    expect(scores.map(topicPercent)).toEqual([null, 50]);
  });

  it('scores each topic of one attempt', () => {
    expect(getAttemptTopicScores(run, buildQuestionMap(topicBank))).toEqual([
      { topic: 'Security', questionCount: 2, answered: 2, correct: 1 },
    ]);
  });
});

describe('getExamTrend', () => {
  it('lists full exams oldest first and leaves out practice and drills', () => {
    const first = {
      ...attempt('2026-03-01T00:00:00.000Z', [result('q1', true), result('q2', false)]),
      correctCount: 1,
    };
    const second = {
      ...attempt('2026-03-02T00:00:00.000Z', [result('q1', true)]),
      correctCount: 1,
    };
    const practice = { ...second, id: 'p', mode: 'practice' as const };
    const drill = { ...second, id: 'd', drill: true };

    expect(getExamTrend([drill, practice, second, first])).toEqual([
      { id: first.id, completedAt: first.completedAt, percent: 50 },
      { id: second.id, completedAt: second.completedAt, percent: 100 },
    ]);
  });
});
