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
import {
  DEFAULT_EXAM_SETTINGS,
  MAX_SAVED_ATTEMPTS,
  buildAttempt,
  countAnswered,
  createSession,
  getScoredQuestionIds,
  type ExamSettings,
} from './lib/session';
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
    () => ({ ...DEFAULT_EXAM_SETTINGS, ...loadJson<Partial<ExamSettings>>(EXAM_SETTINGS_KEY, {}) }),
    { onSaveError: reportStorageError },
  );
  const [attempts, setAttempts] = usePersistentState<Attempt[]>(
    ATTEMPTS_KEY,
    () => {
      const stored = loadJson<Attempt[]>(ATTEMPTS_KEY, []);
      return Array.isArray(stored) ? stored : [];
    },
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

  const openSettings = (returnTo: Screen) => {
    setSettingsReturnScreen(returnTo);
    setScreen('settings');
  };

  const startSession = (mode: SessionMode) => {
    if (!questionBank.length) {
      window.alert('Add at least one question before starting a session.');
      return;
    }

    if (session && !window.confirm('Start a new session and discard the current one?')) {
      return;
    }

    dispatchSession({ type: 'start', session: createSession(mode, questionBank, examSettings) });
    setLatestAttempt(null);
    setScreen('session');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const endSession = () => {
    if (!session) {
      return;
    }

    // Practice can be finished early: only submitted questions are scored.
    const scoredIds = getScoredQuestionIds(session);

    if (session.mode === 'practice') {
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

    const attempt = buildAttempt(session, questionById, scoredIds);
    setAttempts((current) => [attempt, ...current].slice(0, MAX_SAVED_ATTEMPTS));
    setLatestAttempt(attempt);
    dispatchSession({ type: 'clear' });
    setScreen('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

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
            onContinue={() => setScreen('session')}
            onStart={startSession}
            onOpenBank={() => setScreen('bank')}
            onOpenSettings={() => openSettings('home')}
            onClearHistory={clearHistory}
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
          onSelect={(optionId) =>
            dispatchSession({ type: 'select', question: currentQuestion, optionId })
          }
          onNext={() => dispatchSession({ type: 'move', direction: 1 })}
          onPrevious={() => dispatchSession({ type: 'move', direction: -1 })}
          onToggleFlag={() => dispatchSession({ type: 'toggleFlag', questionId: currentQuestion.id })}
          onReview={() => setScreen('review')}
          onSubmitPractice={() => dispatchSession({ type: 'submit', questionId: currentQuestion.id })}
          onFinishPractice={endSession}
          onDiscard={resetCurrentSession}
          onMenu={() => setScreen('home')}
        />
      )}

      {screen === 'review' && session && (
        <ReviewView
          session={session}
          questionById={questionById}
          answeredCount={answeredCount}
          onGoToQuestion={goToQuestion}
          onBack={() => setScreen('session')}
          onSubmit={endSession}
        />
      )}

      {screen === 'results' && latestAttempt && (
        <ResultsView
          attempt={latestAttempt}
          questionById={questionById}
          onHome={() => setScreen('home')}
          onNewExam={() => startSession('exam')}
          onNewPractice={() => startSession('practice')}
        />
      )}

      {screen === 'bank' && (
        <QuestionBankView
          questions={questionBank}
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
