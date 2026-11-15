export const SESSION_KEY = 'mock-exam.current-session';
export const ATTEMPTS_KEY = 'mock-exam.attempts';
export const QUESTION_BANK_KEY = 'mock-exam.question-bank.v3';
export const LEGACY_QUESTION_BANK_KEY = 'mock-exam.question-bank.formatted-v2';
export const EXAM_SETTINGS_KEY = 'mock-exam.exam-settings';
export const AI_SETTINGS_KEY = 'mock-exam.ai-settings';

export function loadJson<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Returns false when the browser refused the write (quota full, private mode, ...). */
export function saveJson(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Could not save ${key} to localStorage:`, error);
    return false;
  }
}

export function removeStoredKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Storage unavailable; nothing to remove.
  }
}
