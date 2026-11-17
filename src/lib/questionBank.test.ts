import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question } from '../types';
import { makeQuestion, memoryStorage } from '../test/fixtures';
import {
  PLACEHOLDER_CORRECT_EXPLANATION,
  PLACEHOLDER_INCORRECT_EXPLANATION,
  applyBankImport,
  createBundledBank,
  createNextQuestionId,
  getOrderedOptions,
  hashString,
  loadQuestionBank,
  normalizeImportedQuestion,
  planBankImport,
  serializeQuestionBank,
  validateQuestion,
  validateQuestionBank,
} from './questionBank';
import { LEGACY_QUESTION_BANK_KEY, QUESTION_BANK_KEY } from './storage';

describe('normalizeImportedQuestion', () => {
  it('upper-cases ids and fills missing fields', () => {
    const question = normalizeImportedQuestion(
      {
        question: 'Q?',
        options: [
          { id: 'a', text: 'one' },
          { text: 'two', explanation: 'no' },
        ],
        correctOptionIds: ['a'],
      },
      4,
    );

    expect(question).toEqual({
      id: 'q005',
      question: 'Q?',
      options: [
        { id: 'A', text: 'one', explanation: '' },
        { id: 'B', text: 'two', explanation: 'no' },
      ],
      correctOptionIds: ['A'],
      summary: '',
    });
  });

  it('moves a legacy question-level explanation into the summary with placeholders', () => {
    const question = normalizeImportedQuestion(
      {
        id: 'q1',
        question: 'Q?',
        options: [
          { id: 'A', text: 'one' },
          { id: 'B', text: 'two', explanation: 'kept' },
          { id: 'C', text: 'three' },
        ],
        correctOptionIds: ['A'],
        explanation: '  Because.  ',
      },
      0,
    );

    expect(question.summary).toBe('Because.');
    expect(question.options.map((option) => option.explanation)).toEqual([
      PLACEHOLDER_CORRECT_EXPLANATION,
      'kept',
      PLACEHOLDER_INCORRECT_EXPLANATION,
    ]);
    expect(question).not.toHaveProperty('explanation');
  });

  it('survives null and non-object input', () => {
    expect(normalizeImportedQuestion(null, 0)).toMatchObject({ id: 'q001', options: [] });
    expect(normalizeImportedQuestion({ options: [null] }, 0).options).toEqual([
      { id: 'A', text: '', explanation: '' },
    ]);
  });
});

describe('validateQuestion', () => {
  it('accepts a complete question', () => {
    expect(validateQuestion(makeQuestion('q1'))).toEqual([]);
  });

  it('reports every problem', () => {
    const question = {
      ...makeQuestion('q1', ['Z'], ['only']),
      question: '',
    };
    question.options.push({ id: 'A', text: '', explanation: '' });

    expect(validateQuestion(question)).toEqual([
      'Question text is required.',
      'Answer options cannot be blank.',
      'Answer option IDs must be unique.',
      'A correct answer points to an option that does not exist.',
    ]);
    expect(validateQuestion({ ...makeQuestion('q2', [], ['x']) })).toEqual([
      'Add at least two answer options.',
      'Select at least one correct answer.',
    ]);
  });
});

describe('validateQuestionBank', () => {
  it('requires an array', () => {
    expect(() => validateQuestionBank({})).toThrow('JSON array');
  });

  it('rejects duplicate ids with the question number', () => {
    expect(() => validateQuestionBank([makeQuestion('q1'), makeQuestion('q1')])).toThrow(
      'Question 2 is invalid: Duplicate question ID: q1.',
    );
  });

  it('rejects invalid questions', () => {
    expect(() => validateQuestionBank([{ question: 'Q?' }])).toThrow(/^Question 1 is invalid/);
  });

  it('returns normalized questions', () => {
    const imported = validateQuestionBank([{ ...makeQuestion('q7'), correctOptionIds: ['b'] }]);
    expect(imported[0].correctOptionIds).toEqual(['B']);
  });
});

describe('createNextQuestionId', () => {
  it('continues after the highest qNNN id and ignores other ids', () => {
    expect(createNextQuestionId([])).toBe('q001');
    expect(
      createNextQuestionId([makeQuestion('q9'), makeQuestion('Q120'), makeQuestion('custom-5')]),
    ).toBe('q121');
  });
});

describe('getOrderedOptions', () => {
  const question = makeQuestion('q1');

  it('follows the session order, dropping unknown ids and appending new options', () => {
    expect(getOrderedOptions(question, ['C', 'X', 'A']).map((option) => option.id)).toEqual([
      'C',
      'A',
      'B',
      'D',
    ]);
  });

  it('falls back to bank order', () => {
    expect(getOrderedOptions(question, undefined).map((option) => option.id)).toEqual([
      'A',
      'B',
      'C',
      'D',
    ]);
  });
});

describe('hashString', () => {
  it('is stable and 8 hex digits', () => {
    expect(hashString('')).toBe('811c9dc5');
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
    expect(hashString('abc')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('loadQuestionBank', () => {
  const bundled = createBundledBank([makeQuestion('q1'), makeQuestion('q2')]);
  const edited = [makeQuestion('q1'), makeQuestion('q9')];

  function useStorage(initial: Record<string, unknown> = {}) {
    vi.stubGlobal('localStorage', memoryStorage(initial));
  }

  beforeEach(() => useStorage());

  it('uses the bundle on a fresh device', () => {
    expect(loadQuestionBank(bundled)).toEqual({
      bundledHash: bundled.hash,
      modified: false,
      questions: bundled.questions,
    });
  });

  it('uses the bundle when the stored bank is unmodified', () => {
    useStorage({ [QUESTION_BANK_KEY]: { bundledHash: 'old', modified: false, questions: [] } });
    expect(loadQuestionBank(bundled).questions).toBe(bundled.questions);
  });

  it('keeps an edited bank and its base hash', () => {
    useStorage({ [QUESTION_BANK_KEY]: { bundledHash: 'old', modified: true, questions: edited } });
    expect(loadQuestionBank(bundled)).toEqual({
      bundledHash: 'old',
      modified: true,
      questions: edited,
    });
  });

  it('treats an unedited legacy copy as the bundle', () => {
    useStorage({ [LEGACY_QUESTION_BANK_KEY]: bundled.questions });
    expect(loadQuestionBank(bundled).modified).toBe(false);
  });

  it('migrates an edited legacy copy as modified with an unknown base', () => {
    useStorage({ [LEGACY_QUESTION_BANK_KEY]: edited });
    expect(loadQuestionBank(bundled)).toEqual({
      bundledHash: null,
      modified: true,
      questions: edited,
    });
  });

  it('falls back to the bundle when storage is unreadable', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
    });
    expect(loadQuestionBank(bundled).modified).toBe(false);
  });
});

describe('serializeQuestionBank', () => {
  it('does not store the questions of an unmodified bank', () => {
    const bank = { bundledHash: 'h', modified: false, questions: [makeQuestion('q1')] };
    expect(serializeQuestionBank(bank)).toEqual({ ...bank, questions: [] });

    const modified = { ...bank, modified: true };
    expect(serializeQuestionBank(modified)).toBe(modified);
  });
});

describe('topic', () => {
  it('is kept when set and left out when blank', () => {
    expect(normalizeImportedQuestion({ ...makeQuestion('q1'), topic: ' Security ' }, 0).topic).toBe(
      'Security',
    );
    expect(normalizeImportedQuestion({ ...makeQuestion('q1'), topic: '  ' }, 0)).not.toHaveProperty(
      'topic',
    );
    expect(normalizeImportedQuestion(makeQuestion('q1'), 0)).not.toHaveProperty('topic');
  });

  it('does not change the fingerprint of a bank without topics', () => {
    const raw = [makeQuestion('q1'), makeQuestion('q2')];
    expect(createBundledBank(raw).json).toBe(JSON.stringify(raw));
  });
});

describe('importing into an existing bank', () => {
  const titled = (id: string, text: string, correct: string[] = ['A']): Question => ({
    ...makeQuestion(id, correct),
    question: text,
  });
  const existing = [titled('q001', 'What is S3?'), titled('q002', 'What is EC2?')];
  // Ids collide with the bank's, as they do when a file numbers its questions by position.
  const imported = [
    titled('q001', 'What is S3?'),
    titled('q002', 'What is Lambda?'),
    // Same question as the bank's q002 (case and spacing are ignored), with another answer key.
    titled('q003', 'what is  EC2?', ['B']),
    titled('q009', 'What is SQS?'),
    titled('q010', 'What is SQS?'),
  ];
  const plan = planBankImport(existing, imported);

  it('matches questions by text, not by id', () => {
    expect(plan.unchangedCount).toBe(1);
    expect(plan.added.map((question) => question.question)).toEqual([
      'What is Lambda?',
      'What is SQS?',
    ]);
    expect(plan.changed.map((question) => question.question)).toEqual(['what is  EC2?']);
  });

  it('adds new questions under free ids and leaves existing ones alone', () => {
    const merged = applyBankImport(existing, plan, 'add-new');
    expect(merged.map((question) => [question.id, question.question])).toEqual([
      ['q001', 'What is S3?'],
      ['q002', 'What is EC2?'],
      ['q003', 'What is Lambda?'],
      ['q009', 'What is SQS?'],
    ]);
    expect(merged[1].correctOptionIds).toEqual(['A']);
  });

  it('updates changed questions in place, keeping their id', () => {
    const merged = applyBankImport(existing, plan, 'add-and-update');
    expect(merged[1]).toMatchObject({ id: 'q002', question: 'what is  EC2?' });
    expect(merged[1].correctOptionIds).toEqual(['B']);
    expect(merged).toHaveLength(4);
    expect(new Set(merged.map((question) => question.id)).size).toBe(4);
  });

  it('replaces the whole bank', () => {
    expect(applyBankImport(existing, plan, 'replace')).toBe(imported);
  });
});
