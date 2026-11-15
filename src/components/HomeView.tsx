import type { Attempt, Question, SavedExamState, SessionMode } from '../types';
import { History } from './History';

type HomeViewProps = {
  session: SavedExamState | null;
  answeredCount: number;
  attempts: Attempt[];
  questionById: Map<string, Question>;
  onContinue: () => void;
  onStart: (mode: SessionMode) => void;
  onOpenBank: () => void;
  onOpenSettings: () => void;
  onClearHistory: () => void;
};

export function HomeView({
  session,
  answeredCount,
  attempts,
  questionById,
  onContinue,
  onStart,
  onOpenBank,
  onOpenSettings,
  onClearHistory,
}: HomeViewProps) {
  return (
    <>
      {session && (
        <section className="panel resume-panel">
          <div>
            <h2>Continue current {session.mode} session?</h2>
            <p>
              Question {session.currentIndex + 1} of {session.questionOrder.length}. You have
              answered {answeredCount} questions.
            </p>
          </div>
          <button className="primary-button" onClick={onContinue}>
            Continue
          </button>
        </section>
      )}

      <section className="mode-grid">
        <button className="mode-card" onClick={() => onStart('exam')}>
          <span>Exam mode</span>
          <strong>Answer all, review, then submit</strong>
          <small>Best for a real mock exam run.</small>
        </button>
        <button className="mode-card" onClick={() => onStart('practice')}>
          <span>Practice mode</span>
          <strong>Submit each question immediately</strong>
          <small>See the correct answer and explanation one by one.</small>
        </button>
        <button className="mode-card" onClick={onOpenBank}>
          <span>Question bank</span>
          <strong>Add, edit, delete, import, export</strong>
          <small>Changes are saved on this device and can be exported as questions.json.</small>
        </button>
        <button className="mode-card" onClick={onOpenSettings}>
          <span>Settings</span>
          <strong>Shuffle, Ask AI, and session options</strong>
          <small>Control question order, answer order, and OpenRouter configuration.</small>
        </button>
      </section>

      <History attempts={attempts} questionById={questionById} onClear={onClearHistory} />
    </>
  );
}
