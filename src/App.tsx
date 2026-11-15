import { useMemo, useState } from 'react';
import type { Attempt, Question, SessionMode } from './types';
import { BundledUpdateNotice, OfflineNotices, StorageErrorNotice } from './components/Notices';
import { HomeView } from './components/HomeView';
import { QuestionBankView } from './components/QuestionBankView';
import { QuestionFormView } from './components/QuestionFormView';
import { QuestionView } from './components/QuestionView';
import { ResultsView } from './components/ResultsView';
import { ReviewView } from './components/ReviewView';
import { SettingsView } from './components/SettingsView';
import { useAskAi } from './hooks/useAskAi';
import { useCountdown } from './hooks/useCountdown';
import { useOfflineStatus } from './hooks/useOfflineStatus';
import { usePersistentState } from './hooks/usePersistentState';
import { useSession } from './hooks/useSession';
import { DEFAULT_AI_SETTINGS, type AiSettings } from './lib/ai';
import { BUNDLED_BANK } from './lib/bundledBank';
import { downloadJson } from './lib/download';
import {
  buildQuestionMap,
  bundledStoredBank,
  createNextQuestionId,
  getOrderedOptions,
  getQuestionWarnings,
  loadQuestionBank,
  serializeQuestionBank,
  validateQuestion,
  validateQuestionBank,
  type StoredQuestionBank,
} from './lib/questionBank';
import {
  applyAiReviewToForm,
  createEmptyQuestionForm,
  formToQuestion,
  questionToForm,
  snapshotOptions,
  type ApplyAiReviewMode,
  type QuestionFormState,
} from './lib/questionForm';
import { createHistoryBackup, mergeAttempts, normalizeStoredAttempts, parseHistoryBackup } from './lib/history';
import {
  MAX_SAVED_ATTEMPTS,
  buildAttempt,
  countAnswered,
  createSession,
  getFlaggedResultIds,
  getScoredQuestionIds,
  getWrongQuestionIds,
  normalizeExamSettings,
  type ExamSettings,
} from './lib/session';
import {
  DEFAULT_FOCUS_SESSION_SIZE,
  getFlaggedQuestionIds,
  getMistakeQuestionIds,
  getQuestionStats,
  getWeakQuestionIds,
} from './lib/stats';
import {
  AI_SETTINGS_KEY,
  ATTEMPTS_KEY,
  EXAM_SETTINGS_KEY,
  LEGACY_QUESTION_BANK_KEY,
  QUESTION_BANK_KEY,
  loadJson,
  removeStoredKey,
} from './lib/storage';

type Screen =
  | 'home'
  | 'session'
  | 'review'
  | 'results'
  | 'bank'
  | 'question-form'
  | 'settings';

function App() {
  const [storageError, setStorageError] = useState(false);
  const reportStorageError = () => setStorageError(true);

  const [storedBank, setStoredBank] = usePersistentState<StoredQuestionBank>(
    QUESTION_BANK_KEY,
    () => loadQuestionBank(BUNDLED_BANK),
    {
      serialize: serializeQuestionBank,
      onSaved: () => removeStoredKey(LEGACY_QUESTION_BANK_KEY),
      onSaveError: reportStorageError,
    },
  );
  const [aiSettings, setAiSettings] = usePersistentState<AiSettings>(
    AI_SETTINGS_KEY,
    () => ({ ...DEFAULT_AI_SETTINGS, ...loadJson<Partial<AiSettings>>(AI_SETTINGS_KEY, {}) }),
    { onSaveError: reportStorageError },
  );
  const [examSettings, setExamSettings] = usePersistentState<ExamSettings>(
    EXAM_SETTINGS_KEY,
    () => normalizeExamSettings(loadJson<Partial<ExamSettings> | null>(EXAM_SETTINGS_KEY, null)),
    { onSaveError: reportStorageError },
  );
  const [attempts, setAttempts] = usePersistentState<Attempt[]>(
    ATTEMPTS_KEY,
    () => normalizeStoredAttempts(loadJson<unknown>(ATTEMPTS_KEY, [])),
    { onSaveError: reportStorageError },
  );

  const questionBank = storedBank.questions;
  const bundledUpdateAvailable = storedBank.modified && storedBank.bundledHash !== BUNDLED_BANK.hash;
  const questionById = useMemo(() => buildQuestionMap(questionBank), [questionBank]);
  const [session, dispatchSession] = useSession(questionById, reportStorageError);

  const [requestedScreen, setScreen] = useState<Screen>(() => (session ? 'session' : 'home'));
  // Never leave the user on an empty session screen (for example after the last question of the
  // session was deleted from the bank).
  const screen =
    (requestedScreen === 'session' || requestedScreen === 'review') && !session
      ? 'home'
      : requestedScreen;
  const [settingsReturnScreen, setSettingsReturnScreen] = useState<Screen>('home');
  const [latestAttempt, setLatestAttempt] = useState<Attempt | null>(null);
  const [questionForm, setQuestionForm] = useState<QuestionFormState>(createEmptyQuestionForm);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [formWarnings, setFormWarnings] = useState<string[]>([]);
  const ai = useAskAi();
  const offline = useOfflineStatus();

  const currentQuestionId = session?.questionOrder[session.currentIndex];
  const currentQuestion = currentQuestionId ? questionById.get(currentQuestionId) : undefined;
  const selectedIds = currentQuestionId ? (session?.selections[currentQuestionId] ?? []) : [];
  const answeredCount = session ? countAnswered(session) : 0;
  const questionStats = useMemo(() => getQuestionStats(attempts), [attempts]);
  const mistakeIds = useMemo(
    () => getMistakeQuestionIds(questionStats, questionById),
    [questionStats, questionById],
  );
  const flaggedIds = useMemo(
    () => getFlaggedQuestionIds(questionStats, questionById),
    [questionStats, questionById],
  );
  // Focus practice needs some history to rank by; until then it would just be random questions.
  const focusIds = useMemo(
    () =>
      questionStats.size
        ? getWeakQuestionIds(
            questionBank,
            questionStats,
            examSettings.questionCount || DEFAULT_FOCUS_SESSION_SIZE,
          )
        : [],
    [questionBank, questionStats, examSettings.questionCount],
  );

  const openSettings = (returnTo: Screen) => {
    setSettingsReturnScreen(returnTo);
    setScreen('settings');
  };

  /**
   * Starts a session over the whole bank (sized by the settings), or over `questionIds` only, for
   * example to retry wrong answers. A session over chosen questions is never sampled or timed.
   */
  const startSession = (mode: SessionMode, questionIds?: string[]) => {
    const chosen = questionIds ? new Set(questionIds) : null;
    const questions = chosen
      ? questionBank.filter((question) => chosen.has(question.id))
      : questionBank;

    if (!questions.length) {
      window.alert('Add at least one question before starting a session.');
      return;
    }

    if (session && !window.confirm('Start a new session and discard the current one?')) {
      return;
    }

    const settings = chosen
      ? { ...examSettings, questionCount: 0, timeLimitMinutes: 0 }
      : examSettings;
    dispatchSession({ type: 'start', session: createSession(mode, questions, settings) });
    setLatestAttempt(null);
    setScreen('session');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const endSession = ({ timedOut = false } = {}) => {
    if (!session) {
      return;
    }

    // Practice can be finished early: only submitted questions are scored.
    const scoredIds = getScoredQuestionIds(session);

    if (session.mode === 'practice' && !timedOut) {
      if (!scoredIds.length) {
        window.alert('Submit at least one answer before finishing.');
        return;
      }

      if (
        scoredIds.length < session.questionOrder.length &&
        !window.confirm(
          `You have submitted ${scoredIds.length} of ${session.questionOrder.length} questions. ` +
            'Finish now and score only the submitted ones?',
        )
      ) {
        return;
      }
    }

    const attempt = buildAttempt(session, questionById, scoredIds, new Date(), timedOut);
    setAttempts((current) => [attempt, ...current].slice(0, MAX_SAVED_ATTEMPTS));
    setLatestAttempt(attempt);
    dispatchSession({ type: 'clear' });

    // A timed exam can run out while the user is editing questions or settings; don't pull
    // them away from that. The attempt is still saved to history.
    if (!timedOut || ['home', 'session', 'review', 'results'].includes(screen)) {
      setScreen('results');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const remainingMs = useCountdown(session?.deadline, () => endSession({ timedOut: true }));

  const goToQuestion = (index: number) => {
    // QuestionView scrolls itself to the top whenever the shown question changes.
    dispatchSession({ type: 'goTo', index });
    setScreen('session');
  };

  const clearHistory = () => {
    if (window.confirm('Clear saved attempt history?')) {
      setAttempts([]);
    }
  };

  const exportHistory = () => {
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(`mock-exam-history-${date}.json`, createHistoryBackup(attempts));
  };

  const importHistory = async (file: File) => {
    try {
      const { attempts: imported, skipped } = parseHistoryBackup(JSON.parse(await file.text()));
      const merged = mergeAttempts(attempts, imported, MAX_SAVED_ATTEMPTS);
      const notes = [
        `Added ${merged.added} of ${imported.length} attempts.`,
        imported.length - merged.added > 0 &&
          'The rest were already in your history, or older than the newest ' +
            `${MAX_SAVED_ATTEMPTS} attempts that are kept.`,
        skipped > 0 && `${skipped} unreadable entries were skipped.`,
      ].filter(Boolean);

      setAttempts(merged.attempts);
      window.alert(notes.join(' '));
    } catch (error) {
      window.alert(
        error instanceof SyntaxError
          ? 'The selected file is not valid JSON.'
          : error instanceof Error
            ? error.message
            : 'Could not import the selected file.',
      );
    }
  };

  const resetCurrentSession = () => {
    if (window.confirm('Discard the current session?')) {
      dispatchSession({ type: 'clear' });
      setLatestAttempt(null);
      setScreen('home');
    }
  };

  /** Replaces the bank and keeps any in-progress session usable instead of discarding it. */
  const applyQuestionBank = (next: StoredQuestionBank) => {
    setStoredBank(next);
    dispatchSession({ type: 'reconcile', questionById: buildQuestionMap(next.questions) });
  };

  const saveQuestionBank = (nextQuestions: Question[]) => {
    applyQuestionBank({
      bundledHash: storedBank.bundledHash,
      modified: true,
      questions: nextQuestions,
    });
  };

  const restoreBundledQuestionBank = () => {
    applyQuestionBank(bundledStoredBank(BUNDLED_BANK));
  };

  const openQuestionForm = (form: QuestionFormState) => {
    ai.cancel();
    setQuestionForm(form);
    setFormErrors([]);
    setFormWarnings([]);
    setScreen('question-form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeQuestionForm = () => {
    ai.cancel();
    setScreen('bank');
  };

  const saveQuestion = (form: QuestionFormState) => {
    const nextQuestion = formToQuestion(form, form.id ?? createNextQuestionId(questionBank));
    const errors = validateQuestion(nextQuestion);
    const warnings = getQuestionWarnings(nextQuestion);

    setFormErrors(errors);
    setFormWarnings(warnings);

    if (errors.length) {
      return;
    }

    const nextQuestions = form.id
      ? questionBank.map((question) => (question.id === form.id ? nextQuestion : question))
      : [...questionBank, nextQuestion];

    saveQuestionBank(nextQuestions);
    closeQuestionForm();
  };

  const duplicateQuestion = (question: Question) => {
    const nextQuestion = {
      ...question,
      id: createNextQuestionId(questionBank),
      question: `${question.question} (copy)`,
    };

    saveQuestionBank([...questionBank, nextQuestion]);
  };

  const deleteQuestion = (questionId: string) => {
    if (!window.confirm('Delete this question?')) {
      return;
    }

    saveQuestionBank(questionBank.filter((question) => question.id !== questionId));
    if (screen === 'question-form' && questionForm.id === questionId) {
      closeQuestionForm();
    }
  };

  const resetQuestionBank = () => {
    if (
      !window.confirm(
        'Reset the question bank to the bundled questions.json? Your local edits will be lost. ' +
          'Export first if you want to keep them.',
      )
    ) {
      return;
    }

    restoreBundledQuestionBank();
  };

  const exportQuestionBank = () => downloadJson('questions.json', questionBank);

  const importQuestionBank = async (file: File) => {
    try {
      const text = await file.text();
      const imported = validateQuestionBank(JSON.parse(text));

      if (
        !window.confirm(
          `Replace the current ${questionBank.length} questions with ${imported.length} imported questions?`,
        )
      ) {
        return;
      }

      saveQuestionBank(imported);
      window.alert(`Imported ${imported.length} questions.`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not import the selected file.');
    }
  };

  const askAiForCurrentQuestion = () => {
    if (!aiSettings.apiKey.trim()) {
      ai.setError('Add your OpenRouter API key in AI Settings first.');
      openSettings('question-form');
      return;
    }

    const candidateQuestion = formToQuestion(
      questionForm,
      questionForm.id ?? createNextQuestionId(questionBank),
    );
    const requiredErrors = validateQuestion(candidateQuestion);

    if (requiredErrors.length) {
      setFormErrors(requiredErrors);
      return;
    }

    setFormErrors([]);
    void ai.ask(candidateQuestion, aiSettings, snapshotOptions(questionForm.optionTexts));
  };

  const applyAiReview = (mode: ApplyAiReviewMode) => {
    if (!ai.review) {
      return;
    }

    const next = applyAiReviewToForm(questionForm, ai.review, mode, new Date().toLocaleString());

    if (!next) {
      window.alert('The answer options changed after this AI review. Ask AI again before applying.');
      return;
    }

    setQuestionForm(next);
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Personal mock exam platform</p>
          <h1>Mock Exam</h1>
          <p className="hero-copy">
            Practice shuffled multiple-choice questions, review before final submission, and
            keep correct/wrong results on this device.
          </p>
        </div>
        <div className="hero-stat">
          <strong>{questionBank.length}</strong>
          <span>questions loaded</span>
        </div>
      </header>

      {storageError && <StorageErrorNotice onDismiss={() => setStorageError(false)} />}

      {screen === 'home' && (
        <>
          {bundledUpdateAvailable && (
            <BundledUpdateNotice
              bundledCount={BUNDLED_BANK.questions.length}
              localCount={questionBank.length}
              onExport={exportQuestionBank}
              onUseBundled={restoreBundledQuestionBank}
              onKeepLocal={() => setStoredBank({ ...storedBank, bundledHash: BUNDLED_BANK.hash })}
            />
          )}
          <OfflineNotices
            status={offline.status}
            readyNotice={offline.readyNotice}
            onDismissReady={offline.dismissReadyNotice}
          />
          <HomeView
            session={session}
            answeredCount={answeredCount}
            attempts={attempts}
            questionById={questionById}
            examSettings={examSettings}
            mistakeCount={mistakeIds.length}
            flaggedCount={flaggedIds.length}
            focusCount={focusIds.length}
            onContinue={() => setScreen('session')}
            onStart={(mode) => startSession(mode)}
            onPracticeMistakes={() => startSession('practice', mistakeIds)}
            onPracticeFlagged={() => startSession('practice', flaggedIds)}
            onPracticeFocus={() => startSession('practice', focusIds)}
            onOpenBank={() => setScreen('bank')}
            onOpenSettings={() => openSettings('home')}
            onClearHistory={clearHistory}
            onExportHistory={exportHistory}
            onImportHistory={importHistory}
          />
        </>
      )}

      {screen === 'session' && session && currentQuestion && (
        <QuestionView
          question={currentQuestion}
          session={session}
          selectedIds={selectedIds}
          orderedOptions={getOrderedOptions(
            currentQuestion,
            session.optionOrders[currentQuestion.id],
          )}
          isSubmitted={session.submittedQuestionIds.includes(currentQuestion.id)}
          isFlagged={session.flaggedQuestionIds.includes(currentQuestion.id)}
          answeredCount={answeredCount}
          submittedCount={session.submittedQuestionIds.length}
          remainingMs={remainingMs}
          onSelect={(optionId) =>
            dispatchSession({ type: 'select', question: currentQuestion, optionId })
          }
          onNext={() => dispatchSession({ type: 'move', direction: 1 })}
          onPrevious={() => dispatchSession({ type: 'move', direction: -1 })}
          onToggleFlag={() => dispatchSession({ type: 'toggleFlag', questionId: currentQuestion.id })}
          onReview={() => setScreen('review')}
          onSubmitPractice={() => dispatchSession({ type: 'submit', questionId: currentQuestion.id })}
          onFinishPractice={() => endSession()}
          onDiscard={resetCurrentSession}
          onMenu={() => setScreen('home')}
        />
      )}

      {screen === 'review' && session && (
        <ReviewView
          session={session}
          questionById={questionById}
          answeredCount={answeredCount}
          remainingMs={remainingMs}
          onGoToQuestion={goToQuestion}
          onBack={() => setScreen('session')}
          onSubmit={() => endSession()}
        />
      )}

      {screen === 'results' && latestAttempt && (
        <ResultsView
          attempt={latestAttempt}
          questionById={questionById}
          retryCount={getWrongQuestionIds(latestAttempt, questionById).length}
          flaggedCount={getFlaggedResultIds(latestAttempt, questionById).length}
          onHome={() => setScreen('home')}
          onNewExam={() => startSession('exam')}
          onNewPractice={() => startSession('practice')}
          onRetryWrong={() =>
            startSession('practice', getWrongQuestionIds(latestAttempt, questionById))
          }
          onPracticeFlagged={() =>
            startSession('practice', getFlaggedResultIds(latestAttempt, questionById))
          }
        />
      )}

      {screen === 'bank' && (
        <QuestionBankView
          questions={questionBank}
          stats={questionStats}
          defaultCount={BUNDLED_BANK.questions.length}
          onBack={() => setScreen('home')}
          onAdd={() => openQuestionForm(createEmptyQuestionForm())}
          onEdit={(question) => openQuestionForm(questionToForm(question))}
          onDuplicate={duplicateQuestion}
          onDelete={deleteQuestion}
          onImport={importQuestionBank}
          onExport={exportQuestionBank}
          onReset={resetQuestionBank}
        />
      )}

      {screen === 'question-form' && (
        <QuestionFormView
          form={questionForm}
          errors={formErrors}
          warnings={formWarnings}
          aiSettings={aiSettings}
          aiStatus={ai.status}
          aiReview={ai.review}
          onChange={setQuestionForm}
          onCancel={closeQuestionForm}
          onSave={saveQuestion}
          onDelete={questionForm.id ? deleteQuestion : undefined}
          onAskAi={askAiForCurrentQuestion}
          onApplyAiReview={applyAiReview}
          onDismissAiReview={ai.dismissReview}
          onOpenAiSettings={() => openSettings('question-form')}
        />
      )}

      {screen === 'settings' && (
        <SettingsView
          examSettings={examSettings}
          aiSettings={aiSettings}
          onExamSettingsChange={setExamSettings}
          onAiSettingsChange={setAiSettings}
          onBack={() => setScreen(settingsReturnScreen)}
        />
      )}
    </main>
  );
}

export default App;
