import type { Question, QuestionOption } from '../types';
import { displayLabel } from './format';
import { LEGACY_QUESTION_BANK_KEY, QUESTION_BANK_KEY, loadJson } from './storage';

// Keep in sync with scripts/migrate-explanations.mjs.
export const PLACEHOLDER_CORRECT_EXPLANATION =
  'Correct answer for this question. See the summary for additional context.';
export const PLACEHOLDER_INCORRECT_EXPLANATION = 'Not the best choice for this scenario.';

/**
 * The question bank as stored on this device.
 * - `modified: false` means "use the bundled questions.json as-is"; `questions` is not stored then.
 * - `bundledHash` is the hash of the bundled questions.json the local copy was based on. When it
 *   differs from the current bundle, a newer questions.json shipped with the app.
 */
export type StoredQuestionBank = {
  bundledHash: string | null;
  modified: boolean;
  questions: Question[];
};

/** The questions.json shipped with the app, normalized, plus its fingerprint. */
export type BundledBank = {
  questions: Question[];
  json: string;
  hash: string;
};

/** FNV-1a 32-bit. Only used to detect that the bundled questions.json changed. */
export function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function createBundledBank(raw: unknown[]): BundledBank {
  const questions = normalizeQuestionBank(raw);
  const json = JSON.stringify(questions);
  return { questions, json, hash: hashString(json) };
}

export function bundledStoredBank(bundled: BundledBank): StoredQuestionBank {
  return { bundledHash: bundled.hash, modified: false, questions: bundled.questions };
}

export function loadQuestionBank(bundled: BundledBank): StoredQuestionBank {
  const stored = loadJson<Partial<StoredQuestionBank> | null>(QUESTION_BANK_KEY, null);

  if (stored && typeof stored === 'object') {
    if (!stored.modified || !Array.isArray(stored.questions)) {
      return bundledStoredBank(bundled);
    }

    return {
      bundledHash: typeof stored.bundledHash === 'string' ? stored.bundledHash : null,
      modified: true,
      questions: normalizeQuestionBank(stored.questions),
    };
  }

  // Migrate the pre-v3 format, which stored a full copy of the bank on first launch whether or
  // not it was edited. If that copy equals the current bundle, treat it as unmodified.
  const legacy = loadJson<unknown>(LEGACY_QUESTION_BANK_KEY, null);

  if (Array.isArray(legacy) && legacy.length) {
    const questions = normalizeQuestionBank(legacy);

    if (JSON.stringify(questions) === bundled.json) {
      return bundledStoredBank(bundled);
    }

    return { bundledHash: null, modified: true, questions };
  }

  return bundledStoredBank(bundled);
}

/** What is written to storage: an unmodified bank is not copied, so bundle updates apply. */
export function serializeQuestionBank(bank: StoredQuestionBank): StoredQuestionBank {
  return bank.modified ? bank : { ...bank, questions: [] };
}

export function normalizeImportedQuestion(item: unknown, index: number): Question {
  const candidate = (item ?? {}) as Partial<Question> & { explanation?: string };
  const options = Array.isArray(candidate.options)
    ? candidate.options.map((option, optionIndex) => {
        const partialOption = (option ?? {}) as Partial<QuestionOption>;
        return {
          id: String(partialOption.id || displayLabel(optionIndex)).toUpperCase(),
          text: String(partialOption.text || ''),
          explanation: String(partialOption.explanation || ''),
        };
      })
    : [];

  const correctOptionIds = Array.isArray(candidate.correctOptionIds)
    ? candidate.correctOptionIds.map((id) => String(id).toUpperCase())
    : [];
  const legacyExplanation =
    typeof candidate.explanation === 'string' ? candidate.explanation.trim() : '';

  // Legacy format: one explanation for the whole question. Keep it as the summary and give
  // each option a placeholder so the per-option panel is never blank.
  if (legacyExplanation) {
    const correctSet = new Set(correctOptionIds);

    for (const option of options) {
      if (!option.explanation.trim()) {
        option.explanation = correctSet.has(option.id)
          ? PLACEHOLDER_CORRECT_EXPLANATION
          : PLACEHOLDER_INCORRECT_EXPLANATION;
      }
    }
  }

  const topic = typeof candidate.topic === 'string' ? candidate.topic.trim() : '';

  return {
    id: String(candidate.id || `q${String(index + 1).padStart(3, '0')}`),
    question: String(candidate.question || ''),
    options,
    correctOptionIds,
    summary: String(candidate.summary || legacyExplanation),
    // Only written when set: the bundled bank's fingerprint is made from this object, so an
    // always-present key would look like a new questions.json on devices with an edited bank.
    ...(topic ? { topic } : {}),
  };
}

export function normalizeQuestionBank(questions: unknown[]): Question[] {
  return questions.map((question, index) => normalizeImportedQuestion(question, index));
}

export function validateQuestion(question: Question): string[] {
  const errors: string[] = [];
  const optionIds = new Set(question.options.map((option) => option.id));

  if (!question.question) {
    errors.push('Question text is required.');
  }

  if (question.options.length < 2) {
    errors.push('Add at least two answer options.');
  }

  if (question.options.some((option) => !option.text)) {
    errors.push('Answer options cannot be blank.');
  }

  if (optionIds.size !== question.options.length) {
    errors.push('Answer option IDs must be unique.');
  }

  if (!question.correctOptionIds.length) {
    errors.push('Select at least one correct answer.');
  }

  if (question.correctOptionIds.some((id) => !optionIds.has(id))) {
    errors.push('A correct answer points to an option that does not exist.');
  }

  return errors;
}

export function getQuestionWarnings(question: Question): string[] {
  return question.options
    .filter((option) => !option.explanation.trim())
    .map((option) => `Option ${option.id} has no explanation.`);
}

/** Normalizes and validates an imported bank. Throws with a readable message on the first error. */
export function validateQuestionBank(value: unknown): Question[] {
  if (!Array.isArray(value)) {
    throw new Error('The imported file must be a JSON array of questions.');
  }

  const ids = new Set<string>();

  return value.map((item, index) => {
    const question = normalizeImportedQuestion(item, index);
    const errors = validateQuestion(question);

    if (ids.has(question.id)) {
      errors.push(`Duplicate question ID: ${question.id}.`);
    }

    ids.add(question.id);

    if (errors.length) {
      throw new Error(`Question ${index + 1} is invalid: ${errors.join(' ')}`);
    }

    return question;
  });
}

export function createNextQuestionId(questions: Question[]): string {
  const maxNumber = questions.reduce((max, question) => {
    const match = question.id.match(/^q(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `q${String(maxNumber + 1).padStart(3, '0')}`;
}

/** Question text reduced to what identifies it: case and spacing are ignored. */
function questionKey(question: Question): string {
  return question.question.trim().replace(/\s+/g, ' ').toLowerCase();
}

export type BankImportMode = 'add-new' | 'add-and-update' | 'replace';

/**
 * What importing a file into the current bank would do. Questions are matched by their text, not
 * by id: ids are often just positions (q001, q002, ...), so two unrelated banks share them.
 */
export type BankImportPlan = {
  imported: Question[];
  /** Questions whose text is not in the bank yet. */
  added: Question[];
  /** Questions already in the bank whose answers, options, explanations or topic differ. */
  changed: Question[];
  /** Questions already in the bank with identical content. */
  unchangedCount: number;
};

export function planBankImport(existing: Question[], imported: Question[]): BankImportPlan {
  const existingByKey = new Map(existing.map((question) => [questionKey(question), question]));
  const seen = new Set<string>();
  const plan: BankImportPlan = { imported, added: [], changed: [], unchangedCount: 0 };

  for (const question of imported) {
    const key = questionKey(question);

    // A question repeated inside the file counts once.
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    const match = existingByKey.get(key);

    if (!match) {
      plan.added.push(question);
    } else if (JSON.stringify({ ...question, id: match.id }) === JSON.stringify(match)) {
      plan.unchangedCount += 1;
    } else {
      plan.changed.push(question);
    }
  }

  return plan;
}

/**
 * The bank after an import. New questions keep their id unless it is taken, in which case they
 * get the next free one. Updated questions keep the id they already have in the bank, so saved
 * history and notes stay attached to them.
 */
export function applyBankImport(
  existing: Question[],
  plan: BankImportPlan,
  mode: BankImportMode,
): Question[] {
  if (mode === 'replace') {
    return plan.imported;
  }

  let result = existing;

  if (mode === 'add-and-update') {
    const changedByKey = new Map(plan.changed.map((question) => [questionKey(question), question]));
    result = existing.map((question) => {
      const update = changedByKey.get(questionKey(question));
      return update ? { ...update, id: question.id } : question;
    });
  }

  result = [...result];
  const usedIds = new Set(result.map((question) => question.id));

  for (const question of plan.added) {
    const id = usedIds.has(question.id) ? createNextQuestionId(result) : question.id;
    usedIds.add(id);
    result.push({ ...question, id });
  }

  return result;
}

export function buildQuestionMap(questions: Question[]): Map<string, Question> {
  return new Map(questions.map((question) => [question.id, question]));
}

/**
 * The question's options in the order they were shown in a session. Options that no longer exist
 * are dropped and options added since are appended, so display letters always match what is shown.
 */
export function getOrderedOptions(
  question: Question,
  optionOrder: string[] | undefined,
): QuestionOption[] {
  const byId = new Map(question.options.map((option) => [option.id, option]));
  const ordered = (optionOrder ?? [])
    .map((id) => byId.get(id))
    .filter((option): option is QuestionOption => Boolean(option));
  const shown = new Set(ordered.map((option) => option.id));
  return [...ordered, ...question.options.filter((option) => !shown.has(option.id))];
}
