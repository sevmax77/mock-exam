import type { Question } from '../types';

/** A question with options A.. from `texts`; option explanations default to "why X". */
export function makeQuestion(
  id: string,
  correctOptionIds: string[] = ['A'],
  texts: string[] = ['one', 'two', 'three', 'four'],
): Question {
  return {
    id,
    question: `Question ${id}?`,
    options: texts.map((text, index) => {
      const optionId = String.fromCharCode(65 + index);
      return { id: optionId, text, explanation: `why ${optionId}` };
    }),
    correctOptionIds,
    summary: '',
  };
}

/** In-memory replacement for window.localStorage. */
export function memoryStorage(initial: Record<string, unknown> = {}): Storage {
  const map = new Map<string, string>(
    Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]),
  );

  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => {
      map.delete(key);
    },
    setItem: (key, value) => {
      map.set(key, String(value));
    },
  };
}
