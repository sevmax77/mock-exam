/** Personal notes, by question id. Kept apart from the question bank so they never change it. */
export type Notes = Record<string, string>;

/** Notes loaded from storage or a backup, with anything that isn't non-empty text dropped. */
export function normalizeNotes(value: unknown): Notes {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].trim() !== '',
    ),
  );
}

/** Notes with the one for `questionId` set to `text`; blank text removes it. */
export function setNote(notes: Notes, questionId: string, text: string): Notes {
  const rest = Object.fromEntries(Object.entries(notes).filter(([id]) => id !== questionId));
  return text.trim() ? { ...rest, [questionId]: text } : rest;
}

/**
 * Adds imported notes to the ones on this device. Where both have a note for a question, the
 * local one is kept. Returns the merged notes and how many were added.
 */
export function mergeNotes(existing: Notes, imported: Notes): { notes: Notes; added: number } {
  const fresh = Object.entries(imported).filter(([questionId]) => !existing[questionId]?.trim());
  return { notes: { ...existing, ...Object.fromEntries(fresh) }, added: fresh.length };
}
