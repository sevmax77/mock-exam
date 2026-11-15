import type { Attempt, Question, SavedExamState, SessionMode } from '../types';
import type { ExamSettings } from '../lib/session';
import { History } from './History';

type HomeViewProps = {
  session: SavedExamState | null;
  answeredCount: number;
  attempts: Attempt[];
  questionById: Map<string, Question>;
  examSettings: ExamSettings;
  /** Questions whose latest result in history was wrong. */
  mistakeCount: number;
  onContinue: () => void;
  onStart: (mode: SessionMode) => void;
  onPracticeMistakes: () => void;
  onOpenBank: () => void;
  onOpenSettings: () => void;
  onClearHistory: () => void;
};

/** "All 127 questions" or "25 random questions", plus the exam time limit when set. */
function describeSession(settings: ExamSettings, bankSize: number, mode: SessionMode): string {
  const size =
    settings.questionCount > 0 && settings.questionCount < bankSize
      ? `${settings.questionCount} random questions`
      : `All ${bankSize} questions`;
  return mode === 'exam' && settings.timeLimitMinutes > 0
    ? `${size} · ${settings.timeLimitMinutes} min`
    : size;
}

export function HomeView({
  session,
  answeredCount,
  attempts,
  questionById,
  examSettings,
  mistakeCount,
  onContinue,
  onStart,
  onPracticeMistakes,
  onOpenBank,
  onOpenSettings,
  onClearHistory,
}: HomeViewProps) {
  const bankSize = questionById.size;

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
          <em className="mode-card-meta">{describeSession(examSettings, bankSize, 'exam')}</em>
        </button>
        <button className="mode-card" onClick={() => onStart('practice')}>
          <span>Practice mode</span>
          <strong>Submit each question immediately</strong>
          <small>See the correct answer and explanation one by one.</small>
          <em className="mode-card-meta">{describeSession(examSettings, bankSize, 'practice')}</em>
        </button>
        {mistakeCount > 0 && (
          <button className="mode-card" onClick={onPracticeMistakes}>
            <span>Practice mistakes</span>
            <strong>
              {mistakeCount} {mistakeCount === 1 ? 'question' : 'questions'} to review
            </strong>
            <small>Questions you got wrong the last time you answered them, in practice mode.</small>
          </button>
        )}
        <button className="mode-card" onClick={onOpenBank}>
          <span>Question bank</span>
          <strong>Add, edit, delete, import, export</strong>
          <small>Changes are saved on this device and can be exported as questions.json.</small>
        </button>
        <button className="mode-card" onClick={onOpenSettings}>
          <span>Settings</span>
          <strong>Session size, timer, Ask AI</strong>
          <small>Control question count, exam time limit, shuffling, and OpenRouter configuration.</small>
        </button>
      </section>

      <History attempts={attempts} questionById={questionById} onClear={onClearHistory} />
    </>
  );
}
