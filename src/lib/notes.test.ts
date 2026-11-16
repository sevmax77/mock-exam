import { describe, expect, it } from 'vitest';
import { mergeNotes, normalizeNotes, setNote } from './notes';

describe('notes', () => {
  it('keeps only non-empty text when loading', () => {
    expect(normalizeNotes({ q1: 'keep', q2: '  ', q3: 5 })).toEqual({ q1: 'keep' });
    expect(normalizeNotes(['x'])).toEqual({});
    expect(normalizeNotes(null)).toEqual({});
  });

  it('sets, replaces and removes a note', () => {
    expect(setNote({}, 'q1', 'first')).toEqual({ q1: 'first' });
    expect(setNote({ q1: 'first', q2: 'other' }, 'q1', 'second')).toEqual({
      q1: 'second',
      q2: 'other',
    });
    expect(setNote({ q1: 'first', q2: 'other' }, 'q1', '  ')).toEqual({ q2: 'other' });
  });

  it('keeps the local note when an import has one for the same question', () => {
    expect(mergeNotes({ q1: 'mine' }, { q1: 'theirs', q2: 'new' })).toEqual({
      notes: { q1: 'mine', q2: 'new' },
      added: 1,
    });
  });
});
