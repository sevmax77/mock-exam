import { describe, expect, it } from 'vitest';
import type { SavedExamState } from '../types';
import { makeQuestion } from '../test/fixtures';
import { buildQuestionMap } from './questionBank';
import type { Attempt } from '../types';
import {
  DEFAULT_EXAM_SETTINGS,
  buildAttempt,
  countAnswered,
  createSession,
  getFlaggedResultIds,
  getScoredQuestionIds,
  getWrongQuestionIds,
  normalizeExamSettings,
  reconcileSession,
  sessionReducer,
} from './session';

const single = makeQuestion('q1', ['B']);
const multi = makeQuestion('q2', ['A', 'C']);
const third = makeQuestion('q3', ['D']);
const bank = [single, multi, third];
const inOrder = { ...DEFAULT_EXAM_SETTINGS, shuffleQuestions: false, shuffleOptions: false };

function session(overrides: Partial<SavedExamState> = {}): SavedExamState {
  return {
    ...createSession('exam', bank, inOrder),
    ...overrides,
  };
}

describe('createSession', () => {
  it('keeps bank order when shuffling is off', () => {
    const created = createSession('practice', bank, inOrder, new Date('2026-02-03T04:05:06Z'));
    expect(created).toEqual({
      mode: 'practice',
      startedAt: '2026-02-03T04:05:06.000Z',
      questionOrder: ['q1', 'q2', 'q3'],
      optionOrders: {
        q1: ['A', 'B', 'C', 'D'],
        q2: ['A', 'B', 'C', 'D'],
        q3: ['A', 'B', 'C', 'D'],
      },
      currentIndex: 0,
      selections: {},
      submittedQuestionIds: [],
      flaggedQuestionIds: [],
    });
  });

  it('shuffles into a permutation of the same ids', () => {
    const created = createSession('exam', bank, DEFAULT_EXAM_SETTINGS);
    expect([...created.questionOrder].sort()).toEqual(['q1', 'q2', 'q3']);
    for (const order of Object.values(created.optionOrders)) {
      expect([...order].sort()).toEqual(['A', 'B', 'C', 'D']);
    }
  });

  it('samples the requested number of questions, keeping bank order when not shuffled', () => {
    const big = Array.from({ length: 20 }, (_, index) => makeQuestion(`q${index + 1}`));
    const created = createSession('exam', big, { ...inOrder, questionCount: 5 });

    expect(created.questionOrder).toHaveLength(5);
    expect(new Set(created.questionOrder).size).toBe(5);
    const positions = created.questionOrder.map((id) => Number(id.slice(1)));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(Object.keys(created.optionOrders).sort()).toEqual([...created.questionOrder].sort());
  });

  it('uses the whole bank when the count is 0 or larger than the bank', () => {
    expect(
      createSession('exam', bank, { ...inOrder, questionCount: 0 }).questionOrder,
    ).toHaveLength(3);
    expect(
      createSession('exam', bank, { ...inOrder, questionCount: 50 }).questionOrder,
    ).toHaveLength(3);
  });

  it('sets a deadline for timed exams only', () => {
    const now = new Date('2026-02-03T10:00:00Z');
    const timed = { ...inOrder, timeLimitMinutes: 90 };

    expect(createSession('exam', bank, timed, now).deadline).toBe('2026-02-03T11:30:00.000Z');
    expect(createSession('practice', bank, timed, now)).not.toHaveProperty('deadline');
    expect(createSession('exam', bank, inOrder, now)).not.toHaveProperty('deadline');
  });
});

describe('normalizeExamSettings', () => {
  it('fills in defaults for settings saved by older versions', () => {
    expect(normalizeExamSettings({ shuffleQuestions: false, shuffleOptions: true })).toEqual({
      shuffleQuestions: false,
      shuffleOptions: true,
      questionCount: 0,
      timeLimitMinutes: 0,
    });
    expect(normalizeExamSettings(null)).toEqual(DEFAULT_EXAM_SETTINGS);
  });

  it('repairs invalid numbers', () => {
    const repaired = normalizeExamSettings({
      questionCount: -3,
      timeLimitMinutes: 12.7,
    } as never);
    expect(repaired.questionCount).toBe(0);
    expect(repaired.timeLimitMinutes).toBe(12);
    expect(normalizeExamSettings({ questionCount: 'x' } as never).questionCount).toBe(0);
  });
});

describe('questions of one attempt', () => {
  const result = (questionId: string, isCorrect: boolean, flagged?: boolean) => ({
    questionId,
    selectedOptionIds: [],
    correctOptionIds: [],
    isCorrect,
    ...(flagged ? { flagged } : {}),
  });
  const attempt = (results: Attempt['results']): Attempt => ({
    id: 'a',
    mode: 'exam',
    startedAt: '',
    completedAt: '',
    totalQuestions: results.length,
    correctCount: 0,
    wrongCount: 0,
    results,
  });

  it('lists the wrong answers that still exist', () => {
    const one = attempt([result('q1', false), result('q2', true), result('q9', false)]);
    expect(getWrongQuestionIds(one, buildQuestionMap(bank))).toEqual(['q1']);
  });

  it('lists the flagged questions that still exist', () => {
    const one = attempt([result('q1', true, true), result('q2', false), result('q9', false, true)]);
    expect(getFlaggedResultIds(one, buildQuestionMap(bank))).toEqual(['q1']);
  });
});

describe('reconcileSession', () => {
  it('returns null for missing or unusable sessions', () => {
    const byId = buildQuestionMap(bank);
    expect(reconcileSession(null, byId)).toBeNull();
    expect(reconcileSession({} as SavedExamState, byId)).toBeNull();
    expect(reconcileSession(session(), buildQuestionMap([]))).toBeNull();
  });

  it('drops deleted questions and keeps the current question selected', () => {
    const saved = session({
      currentIndex: 2,
      selections: { q1: ['B'], q3: ['D'] },
      submittedQuestionIds: ['q1', 'q3'],
      flaggedQuestionIds: ['q1'],
    });
    const reconciled = reconcileSession(saved, buildQuestionMap([multi, third]));

    expect(reconciled?.questionOrder).toEqual(['q2', 'q3']);
    expect(reconciled?.currentIndex).toBe(1);
    expect(reconciled?.selections).toEqual({ q3: ['D'] });
    expect(reconciled?.submittedQuestionIds).toEqual(['q3']);
    expect(reconciled?.flaggedQuestionIds).toEqual([]);
  });

  it('clamps the index when the current question was deleted', () => {
    const saved = session({ currentIndex: 2 });
    const reconciled = reconcileSession(saved, buildQuestionMap([single]));
    expect(reconciled?.questionOrder).toEqual(['q1']);
    expect(reconciled?.currentIndex).toBe(0);
  });

  it('drops deleted options and appends new ones, keeping the shown order', () => {
    const saved = session({
      optionOrders: {
        q1: ['D', 'C', 'B', 'A'],
        q2: ['A', 'B', 'C', 'D'],
        q3: ['A', 'B', 'C', 'D'],
      },
      selections: { q1: ['C'] },
    });
    const edited = {
      ...single,
      options: [single.options[0], single.options[1], { id: 'E', text: 'new', explanation: '' }],
    };
    const reconciled = reconcileSession(saved, buildQuestionMap([edited, multi, third]));

    expect(reconciled?.optionOrders.q1).toEqual(['B', 'A', 'E']);
    expect(reconciled?.selections).toEqual({});
  });
});

describe('sessionReducer', () => {
  it('starts and clears', () => {
    const started = session();
    expect(sessionReducer(null, { type: 'start', session: started })).toBe(started);
    expect(sessionReducer(started, { type: 'clear' })).toBeNull();
  });

  it('ignores session actions when there is no session', () => {
    expect(sessionReducer(null, { type: 'move', direction: 1 })).toBeNull();
    expect(sessionReducer(null, { type: 'select', question: single, optionId: 'A' })).toBeNull();
  });

  it('replaces the selection for single-answer questions', () => {
    let state = sessionReducer(session(), { type: 'select', question: single, optionId: 'A' });
    state = sessionReducer(state, { type: 'select', question: single, optionId: 'C' });
    expect(state?.selections.q1).toEqual(['C']);
  });

  it('toggles multi-answer selections up to the number of correct answers', () => {
    let state: SavedExamState | null = session();
    for (const optionId of ['A', 'B', 'C']) {
      state = sessionReducer(state, { type: 'select', question: multi, optionId });
    }
    expect(state?.selections.q2).toEqual(['A', 'B']);

    state = sessionReducer(state, { type: 'select', question: multi, optionId: 'A' });
    expect(state?.selections.q2).toEqual(['B']);
  });

  it('returns the same state when the limit blocks a selection', () => {
    const full = session({ selections: { q2: ['A', 'B'] } });
    expect(sessionReducer(full, { type: 'select', question: multi, optionId: 'C' })).toBe(full);
  });

  it('locks answers after a practice submit', () => {
    const practice = session({ mode: 'practice', selections: { q1: ['A'] } });
    const submitted = sessionReducer(practice, { type: 'submit', questionId: 'q1' });
    expect(submitted?.submittedQuestionIds).toEqual(['q1']);

    const changed = sessionReducer(submitted, { type: 'select', question: single, optionId: 'B' });
    expect(changed).toBe(submitted);
  });

  it('does not submit without a selection or twice', () => {
    const empty = session({ mode: 'practice' });
    expect(sessionReducer(empty, { type: 'submit', questionId: 'q1' })).toBe(empty);

    const once = session({
      mode: 'practice',
      selections: { q1: ['A'] },
      submittedQuestionIds: ['q1'],
    });
    expect(sessionReducer(once, { type: 'submit', questionId: 'q1' })).toBe(once);
  });

  it('moves within bounds', () => {
    const start = session();
    expect(sessionReducer(start, { type: 'move', direction: -1 })).toBe(start);

    const next = sessionReducer(start, { type: 'move', direction: 1 });
    expect(next?.currentIndex).toBe(1);
    expect(sessionReducer(next, { type: 'goTo', index: 99 })?.currentIndex).toBe(2);
    expect(sessionReducer(next, { type: 'goTo', index: -5 })?.currentIndex).toBe(0);
  });

  it('toggles flags', () => {
    const flagged = sessionReducer(session(), { type: 'toggleFlag', questionId: 'q2' });
    expect(flagged?.flaggedQuestionIds).toEqual(['q2']);
    expect(
      sessionReducer(flagged, { type: 'toggleFlag', questionId: 'q2' })?.flaggedQuestionIds,
    ).toEqual([]);
  });

  it('reconciles against a new bank', () => {
    const state = sessionReducer(session(), {
      type: 'reconcile',
      questionById: buildQuestionMap([third]),
    });
    expect(state?.questionOrder).toEqual(['q3']);
  });
});

describe('scoring a finished session', () => {
  it('scores all questions in exam mode', () => {
    expect(getScoredQuestionIds(session())).toEqual(['q1', 'q2', 'q3']);
  });

  it('scores only submitted questions in practice mode, in session order', () => {
    const practice = session({ mode: 'practice', submittedQuestionIds: ['q3', 'q1'] });
    expect(getScoredQuestionIds(practice)).toEqual(['q1', 'q3']);
  });

  it('builds an attempt', () => {
    const finished = session({ selections: { q1: ['B'], q2: ['A'] } });
    const attempt = buildAttempt(
      finished,
      buildQuestionMap(bank),
      ['q1', 'q2'],
      new Date('2026-03-01T10:00:00Z'),
    );

    expect(attempt).toMatchObject({
      id: String(Date.parse('2026-03-01T10:00:00Z')),
      mode: 'exam',
      completedAt: '2026-03-01T10:00:00.000Z',
      totalQuestions: 2,
      correctCount: 1,
      wrongCount: 1,
    });
    expect(countAnswered(finished)).toBe(2);
    expect(attempt).not.toHaveProperty('timedOut');
  });

  it('records which scored questions were flagged', () => {
    const flagged = session({ flaggedQuestionIds: ['q2', 'q3'] });
    const attempt = buildAttempt(flagged, buildQuestionMap(bank), ['q1', 'q2']);

    expect(attempt.results.map((result) => result.flagged)).toEqual([undefined, true]);
    expect(attempt.results[0]).not.toHaveProperty('flagged');
  });

  it('marks attempts submitted by the timer', () => {
    const attempt = buildAttempt(session(), buildQuestionMap(bank), ['q1'], new Date(), true);
    expect(attempt.timedOut).toBe(true);
  });

  it('keeps the deadline when a session is reconciled', () => {
    const timed = session({ deadline: '2026-03-01T10:00:00.000Z' });
    expect(reconcileSession(timed, buildQuestionMap(bank))?.deadline).toBe(timed.deadline);
  });
});
