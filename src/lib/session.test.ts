import { describe, expect, it } from 'vitest';
import type { SavedExamState } from '../types';
import { makeQuestion } from '../test/fixtures';
import { buildQuestionMap } from './questionBank';
import {
  buildAttempt,
  countAnswered,
  createSession,
  getScoredQuestionIds,
  reconcileSession,
  sessionReducer,
} from './session';

const single = makeQuestion('q1', ['B']);
const multi = makeQuestion('q2', ['A', 'C']);
const third = makeQuestion('q3', ['D']);
const bank = [single, multi, third];

function session(overrides: Partial<SavedExamState> = {}): SavedExamState {
  return {
    ...createSession('exam', bank, { shuffleQuestions: false, shuffleOptions: false }),
    ...overrides,
  };
}

describe('createSession', () => {
  it('keeps bank order when shuffling is off', () => {
    const created = createSession(
      'practice',
      bank,
      { shuffleQuestions: false, shuffleOptions: false },
      new Date('2026-02-03T04:05:06Z'),
    );
    expect(created).toEqual({
      mode: 'practice',
      startedAt: '2026-02-03T04:05:06.000Z',
      questionOrder: ['q1', 'q2', 'q3'],
      optionOrders: { q1: ['A', 'B', 'C', 'D'], q2: ['A', 'B', 'C', 'D'], q3: ['A', 'B', 'C', 'D'] },
      currentIndex: 0,
      selections: {},
      submittedQuestionIds: [],
      flaggedQuestionIds: [],
    });
  });

  it('shuffles into a permutation of the same ids', () => {
    const created = createSession('exam', bank, { shuffleQuestions: true, shuffleOptions: true });
    expect([...created.questionOrder].sort()).toEqual(['q1', 'q2', 'q3']);
    for (const order of Object.values(created.optionOrders)) {
      expect([...order].sort()).toEqual(['A', 'B', 'C', 'D']);
    }
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
      optionOrders: { q1: ['D', 'C', 'B', 'A'], q2: ['A', 'B', 'C', 'D'], q3: ['A', 'B', 'C', 'D'] },
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

    const once = session({ mode: 'practice', selections: { q1: ['A'] }, submittedQuestionIds: ['q1'] });
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
    expect(sessionReducer(flagged, { type: 'toggleFlag', questionId: 'q2' })?.flaggedQuestionIds).toEqual([]);
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
  });
});
