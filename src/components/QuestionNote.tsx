import { useEffect, useRef, useState } from 'react';

/** How long after the last keystroke the note is saved. */
const SAVE_DELAY_MS = 500;

type QuestionNoteProps = {
  note: string;
  onChange: (text: string) => void;
};

/**
 * A personal note on one question. Typing only updates this box; the note is saved shortly after
 * the last keystroke, when the box loses focus, and when it leaves the screen. Saving on every
 * keystroke would redraw the whole results page each time.
 *
 * When `note` changes from outside (another box for the same question saved it), the box takes
 * the new text unless something unsaved was typed here. Give it a `key` that changes when it
 * should show another question's note.
 */
export function QuestionNote({ note, onChange }: QuestionNoteProps) {
  const [draft, setDraft] = useState(note);
  const [seenNote, setSeenNote] = useState(note);

  if (note !== seenNote) {
    setSeenNote(note);
    // Nothing unsaved here: follow the saved note. Otherwise keep what was typed.
    if (draft === seenNote) {
      setDraft(note);
    }
  }
  const latest = useRef({ draft, note, onChange });
  useEffect(() => {
    latest.current = { draft, note, onChange };
  });

  const save = () => {
    const current = latest.current;
    if (current.draft !== current.note) {
      current.onChange(current.draft);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(save, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [draft]);

  // Save what was typed last when the box is removed, for example on leaving the screen.
  useEffect(() => save, []);

  return (
    <label className="form-field question-note">
      <span>My note</span>
      <textarea
        rows={2}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={save}
        placeholder="Why did I miss this? What should I remember next time?"
      />
    </label>
  );
}
