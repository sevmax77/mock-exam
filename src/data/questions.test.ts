import { describe, expect, it } from 'vitest';
import questionsJson from './questions.json';
import { normalizeImportedQuestion, validateQuestion } from '../lib/questionBank';

// Checks the bundled question bank, whichever copy is checked out (the public sample or a
// local full bank). Failures list the offending question ids.
const raw = questionsJson as unknown[];
const questions = raw.map((item, index) => normalizeImportedQuestion(item, index));

describe('questions.json', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(raw)).toBe(true);
    expect(raw.length).toBeGreaterThan(0);
  });

  it('has unique question ids', () => {
    const seen = new Set<string>();
    const duplicates = questions.map((question) => question.id).filter((id) => {
      const duplicate = seen.has(id);
      seen.add(id);
      return duplicate;
    });
    expect(duplicates).toEqual([]);
  });

  it('has only valid questions', () => {
    const invalid = questions
      .map((question) => ({ id: question.id, errors: validateQuestion(question) }))
      .filter((entry) => entry.errors.length);
    expect(invalid).toEqual([]);
  });

  it('is already in the current format', () => {
    // Normalizing must not change anything: ids are upper-case and there are no legacy fields.
    const changed = raw
      .filter((item, index) => JSON.stringify(item) !== JSON.stringify(questions[index]))
      .map((item) => (item as { id?: string }).id);
    expect(changed).toEqual([]);
  });

  it('has an explanation for every option', () => {
    const missing = questions.flatMap((question) =>
      question.options
        .filter((option) => !option.explanation.trim())
        .map((option) => `${question.id}/${option.id}`),
    );
    expect(missing).toEqual([]);
  });
});
