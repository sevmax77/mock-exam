import type { Attempt, Question, SavedExamState, SessionMode } from '../types';
import type { ExamSettings } from '../lib/session';
import type { TopicScore, TrendPoint } from '../lib/stats';
import { History } from './History';
import { TopicScores } from './TopicScores';

type HomeViewProps = {
  session: SavedExamState | null;
  answeredCount: number;
  attempts: Attempt[];
  questionById: Map<string, Question>;
  examSettings: ExamSettings;
  /** Questions whose latest result in history was wrong. */
  mistakeCount: number;
  /** Questions flagged the last time they were answered. */
  flaggedCount: number;
  /** Size of a focus session; 0 hides the card (no history yet). */
  focusCount: number;
  /** History score per topic; empty when the bank has no topics. */
  topicScores: TopicScore[];
  /** Full exams, oldest first, for the trend chart. */
  trend: TrendPoint[];
  onContinue: () => void;
  onStart: (mode: SessionMode) => void;
  onPracticeMistakes: () => void;
  onPracticeFlagged: () => void;
  onPracticeFocus: () => void;
  onPracticeTopic: (topic: string) => void;
  onViewAttempt: (attempt: Attempt) => void;
  onOpenBank: () => void;
  onOpenSettings: () => void;
  onClearHistory: () => void;
  onExportHistory: () => void;
  onImportHistory: (file: File) => Promise<void>;
};

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

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
  flaggedCount,
  focusCount,
  topicScores,
  trend,
  onContinue,
  onStart,
  onPracticeMistakes,
  onPracticeFlagged,
  onPracticeFocus,
  onPracticeTopic,
  onViewAttempt,
  onOpenBank,
  onOpenSettings,
  onClearHistory,
  onExportHistory,
  onImportHistory,
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
            <strong>{plural(mistakeCount, 'question')} to review</strong>
            <small>
              Questions you got wrong the last time you answered them, in practice mode.
            </small>
          </button>
        )}
        {flaggedCount > 0 && (
          <button className="mode-card" onClick={onPracticeFlagged}>
            <span>Practice flagged</span>
            <strong>{plural(flaggedCount, 'flagged question')}</strong>
            <small>Questions you flagged the last time you answered them, in practice mode.</small>
          </button>
        )}
        {focusCount > 0 && (
          <button className="mode-card" onClick={onPracticeFocus}>
            <span>Focus practice</span>
            <strong>Your {plural(focusCount, 'weakest question')}</strong>
            <small>
              Picks the questions you get wrong most often, then ones you haven't answered yet.
            </small>
          </button>
        )}
        <button className="mode-card" onClick={onOpenBank}>
          <span>Question bank</span>
          <strong>Add, edit, delete, import, export</strong>
          <small>Changes are saved on this device and can be exported as questions.json.</small>
        </button>
        <button className="mode-card" onClick={onOpenSettings}>
          <span>Settings</span>
          <strong>Session size, timer, target, Ask AI</strong>
          <small>
            Control question count, exam time limit, target score, shuffling, and OpenRouter
            configuration.
          </small>
        </button>
      </section>

      {topicScores.length > 0 && (
        <section className="panel topic-panel">
          <p className="eyebrow">From your saved history</p>
          <h2>Topics</h2>
          <TopicScores scores={topicScores} onPractice={onPracticeTopic} />
        </section>
      )}

      <History
        attempts={attempts}
        questionById={questionById}
        trend={trend}
        targetScorePercent={examSettings.targetScorePercent}
        onView={onViewAttempt}
        onClear={onClearHistory}
        onExport={onExportHistory}
        onImport={onImportHistory}
      />
    </>
  );
}
