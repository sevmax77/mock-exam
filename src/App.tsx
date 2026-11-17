import { useCallback, useMemo, useState } from 'react';
import type { Attempt, Question, SessionMode } from './types';
import { BundledUpdateNotice, OfflineNotices, StorageErrorNotice } from './components/Notices';
import { HomeView } from './components/HomeView';
import { QuestionBankView } from './components/QuestionBankView';
import { QuestionFormView } from './components/QuestionFormView';
import { QuestionView } from './components/QuestionView';
import { ResultsView } from './components/ResultsView';
import { ReviewView } from './components/ReviewView';
import { SettingsView } from './components/SettingsView';
import { useBankImport } from './hooks/useBankImport';
import { useBatchAskAi } from './hooks/useBatchAskAi';
import { useScreenHistory } from './hooks/useScreenHistory';
import type { Screen } from './lib/routing';
import { useCountdown } from './hooks/useCountdown';
import { useDialog } from './hooks/useDialog';
import { useLatest } from './hooks/useLatest';
import { useOfflineStatus } from './hooks/useOfflineStatus';
import { useQuestionEditor } from './hooks/useQuestionEditor';
import { usePersistentState } from './hooks/usePersistentState';
import { useSession } from './hooks/useSession';
import { DEFAULT_AI_MODEL, normalizeAiSettings, type AiReview, type AiSettings } from './lib/ai';
import { fillExplanationsFromReview, needsExplanations } from './lib/batchAi';
import { BUNDLED_BANK } from './lib/bundledBank';
import { downloadJson } from './lib/download';
import { slide } from './lib/motion';
import { mergeNotes, normalizeNotes, setNote, type Notes } from './lib/notes';
import {
  buildQuestionMap,
  bundledStoredBank,
  createNextQuestionId,
  getOrderedOptions,
  loadQuestionBank,
  serializeQuestionBank,
  type StoredQuestionBank,
} from './lib/questionBank';
import { createEmptyQuestionForm, questionToForm } from './lib/questionForm';
import {
  addAttempt,
  createHistoryBackup,
  mergeAttempts,
  normalizeStoredAttempts,
  parseHistoryBackup,
} from './lib/history';
import {
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
  getExamTrend,
  getFlaggedQuestionIds,
  getMistakeQuestionIds,
  getQuestionStats,
  getTopicStats,
  getTopics,
  getWeakQuestionIds,
} from './lib/stats';
import {
  AI_SETTINGS_KEY,
  ATTEMPTS_KEY,
  EXAM_SETTINGS_KEY,
  LEGACY_QUESTION_BANK_KEY,
  NOTES_KEY,
  QUESTION_BANK_KEY,
  loadJson,
  removeStoredKey,
} from './lib/storage';

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
    () => normalizeAiSettings(loadJson<Partial<AiSettings> | null>(AI_SETTINGS_KEY, null)),
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
  const [notes, setNotes] = usePersistentState<Notes>(
    NOTES_KEY,
    () => normalizeNotes(loadJson<unknown>(NOTES_KEY, null)),
    { onSaveError: reportStorageError },
  );

  // Stable, so saving a note redraws only the result card it belongs to.
  const changeNote = useCallback(
    (questionId: string, text: string) => setNotes((current) => setNote(current, questionId, text)),
    [setNotes],
  );

  const questionBank = storedBank.questions;
  const currentBankRef = useLatest(questionBank);
  const bundledUpdateAvailable =
    storedBank.modified && storedBank.bundledHash !== BUNDLED_BANK.hash;
  const questionById = useMemo(() => buildQuestionMap(questionBank), [questionBank]);
  const [session, dispatchSession] = useSession(questionById, reportStorageError);
  const dialog = useDialog();
  const currentSessionRef = useLatest(session);

  /** The attempt on the results screen: the one just finished, or one opened from history. */
  const [latestAttempt, setLatestAttempt] = useState<Attempt | null>(null);
  const { screen, navigate, goBack } = useScreenHistory(
    () => (session ? 'session' : 'home'),
    // Never show an empty screen: a session screen without a session (for example after its last
    // question was deleted, or when going "forward" to a finished session), or results after a
    // reload, when the attempt is no longer in memory.
    (requested) =>
      ((requested === 'session' || requested === 'review') && !session) ||
      (requested === 'results' && !latestAttempt)
        ? 'home'
        : requested,
  );
  /** Where Settings goes back to when it was opened directly (for example after a reload). */
  const [settingsReturnScreen, setSettingsReturnScreen] = useState<Screen>('home');
  const batchAi = useBatchAskAi();
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
  const topics = useMemo(() => getTopics(questionBank), [questionBank]);
  const topicScores = useMemo(
    () => getTopicStats(questionBank, questionStats),
    [questionBank, questionStats],
  );
  const examTrend = useMemo(() => getExamTrend(attempts), [attempts]);

  const openSettings = (returnTo: Screen) => {
    setSettingsReturnScreen(returnTo);
    navigate('settings');
  };

  /**
   * Starts a session over the whole bank (sized by the settings), or over `questionIds` only, for
   * example to retry wrong answers. A session over chosen questions is never sampled or timed.
   */
  const startSession = async (mode: SessionMode, questionIds?: string[]) => {
    const chosen = questionIds ? new Set(questionIds) : null;
    const questions = chosen
      ? questionBank.filter((question) => chosen.has(question.id))
      : questionBank;

    if (!questions.length) {
      await dialog.alert({
        title: 'No questions to use',
        message: 'Add at least one question before starting a session.',
      });
      return;
    }

    if (
      session &&
      !(await dialog.confirm({
        title: 'Start a new session?',
        message: 'The session in progress will be discarded.',
        confirmLabel: 'Discard and start',
        cancelLabel: 'Keep current',
        destructive: true,
      }))
    ) {
      return;
    }

    const settings = chosen
      ? { ...examSettings, questionCount: 0, timeLimitMinutes: 0 }
      : examSettings;
    const nextSession = createSession(mode, questions, settings, new Date(), Boolean(chosen));
    slide('forward', () => {
      dispatchSession({ type: 'start', session: nextSession });
      setLatestAttempt(null);
      // From results, replace that entry: its attempt is cleared, so going back to it would only
      // show home.
      navigate('session', { replace: screen === 'results' });
    });
  };

  const endSession = async ({ timedOut = false } = {}) => {
    if (!session) {
      return;
    }

    // Practice can be finished early: only submitted questions are scored.
    const scoredIds = getScoredQuestionIds(session);

    if (session.mode === 'practice' && !timedOut) {
      if (!scoredIds.length) {
        await dialog.alert({
          title: 'Nothing to score yet',
          message: 'Submit at least one answer before finishing.',
        });
        return;
      }

      if (
        scoredIds.length < session.questionOrder.length &&
        !(await dialog.confirm({
          title: 'Finish practice now?',
          message:
            `You have submitted ${scoredIds.length} of ${session.questionOrder.length} ` +
            'questions. Only the submitted ones will be scored.',
          confirmLabel: 'Finish now',
          cancelLabel: 'Keep practising',
        }))
      ) {
        return;
      }
    }

    const attempt = buildAttempt(session, questionById, scoredIds, new Date(), timedOut);
    const finish = () => {
      setAttempts((current) => addAttempt(current, attempt));
      setLatestAttempt(attempt);
      dispatchSession({ type: 'clear' });
    };

    // A timed exam can run out while the user is editing questions or settings; don't pull
    // them away from that. The attempt is still saved to history.
    if (timedOut && !['home', 'session', 'review', 'results'].includes(screen)) {
      finish();
      return;
    }

    slide('forward', () => {
      finish();
      // Results take the place of the finished session in the browser history.
      navigate('results', { replace: true });
    });
  };

  // Review is part of the session: both share one history entry, so the browser's back button
  // leaves the session from either.
  const openReview = () => navigate('review', { replace: true });
  const closeReview = () => navigate('session', { replace: true, direction: 'backward' });

  const remainingMs = useCountdown(session?.deadline, () => endSession({ timedOut: true }));

  const goToQuestion = (index: number) =>
    slide('backward', () => {
      // QuestionView scrolls itself to the top whenever the shown question changes.
      dispatchSession({ type: 'goTo', index });
      closeReview();
    });

  /** Moves to the next or previous question, sliding only the question itself. */
  const moveQuestion = (direction: 1 | -1) =>
    slide(
      direction === 1 ? 'forward' : 'backward',
      () => dispatchSession({ type: 'move', direction }),
      {
        question: true,
      },
    );

  const clearHistory = async () => {
    if (
      await dialog.confirm({
        title: 'Clear attempt history?',
        message: 'Every saved attempt is deleted. Export the history first to keep a copy.',
        confirmLabel: 'Clear history',
        destructive: true,
      })
    ) {
      setAttempts([]);
    }
  };

  const exportHistory = () => {
    const date = new Date().toISOString().slice(0, 10);
    downloadJson(`mock-exam-history-${date}.json`, createHistoryBackup(attempts, notes));
  };

  /** Opens the full results of an attempt from the history. */
  const viewAttempt = (attempt: Attempt) =>
    slide('forward', () => {
      setLatestAttempt(attempt);
      navigate('results');
    });

  const practiceTopic = (topic: string) =>
    startSession(
      'practice',
      questionBank.filter((question) => question.topic === topic).map((question) => question.id),
    );

  const importHistory = async (file: File) => {
    try {
      const {
        attempts: imported,
        notes: importedNotes,
        skipped,
      } = parseHistoryBackup(JSON.parse(await file.text()));
      const merged = mergeAttempts(attempts, imported);
      const mergedNotes = mergeNotes(notes, importedNotes);
      const messages = [
        `Added ${merged.added} of ${imported.length} attempts.`,
        imported.length - merged.added > 0 &&
          'The rest were already in your history, or older than the attempts that are kept.',
        mergedNotes.added > 0 && `Added ${mergedNotes.added} notes.`,
        skipped > 0 && `${skipped} unreadable entries were skipped.`,
      ].filter(Boolean);

      setAttempts(merged.attempts);
      setNotes(mergedNotes.notes);
      await dialog.alert({ title: 'History imported', message: messages.join(' ') });
    } catch (error) {
      await dialog.alert({
        title: 'Could not import history',
        message:
          error instanceof SyntaxError
            ? 'The selected file is not valid JSON.'
            : error instanceof Error
              ? error.message
              : 'Could not import the selected file.',
      });
    }
  };

  const resetCurrentSession = async () => {
    const startedAt = session?.startedAt;

    if (
      (await dialog.confirm({
        title: 'Discard this session?',
        message: 'Your answers so far are not saved to the history.',
        confirmLabel: 'Discard session',
        cancelLabel: 'Keep going',
        destructive: true,
      })) &&
      // If the exam timed out meanwhile, it is already saved and its results are showing.
      currentSessionRef.current?.startedAt === startedAt
    ) {
      slide('backward', () => {
        dispatchSession({ type: 'clear' });
        setLatestAttempt(null);
        goBack('home');
        // Home shows right away (no session to show); the browser's back step comes later.
        window.scrollTo(0, 0);
      });
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

  const editor = useQuestionEditor({
    questionBank,
    aiSettings,
    saveQuestionBank,
    navigate,
    goBack,
    openSettings,
  });
  const bankImport = useBankImport(questionBank, saveQuestionBank);

  const restoreBundledQuestionBank = () => {
    applyQuestionBank(bundledStoredBank(BUNDLED_BANK));
  };

  const duplicateQuestion = (question: Question) => {
    const nextQuestion = {
      ...question,
      id: createNextQuestionId(questionBank),
      question: `${question.question} (copy)`,
    };

    saveQuestionBank([...questionBank, nextQuestion]);
  };

  const deleteQuestion = async (questionId: string) => {
    if (
      !(await dialog.confirm({
        title: 'Delete this question?',
        message: 'It is removed from the question bank on this device.',
        confirmLabel: 'Delete question',
        destructive: true,
      }))
    ) {
      return;
    }

    // The latest bank, not the one from before the dialog: Batch Ask AI may have filled in
    // explanations meanwhile.
    saveQuestionBank(currentBankRef.current.filter((question) => question.id !== questionId));
    if (screen === 'question-form' && editor.form.id === questionId) {
      editor.close();
    }
  };

  const resetQuestionBank = async () => {
    if (
      !(await dialog.confirm({
        title: 'Reset the question bank?',
        message:
          'The bank goes back to the bundled questions.json and your local edits are lost. ' +
          'Export first if you want to keep them.',
        confirmLabel: 'Reset bank',
        destructive: true,
      }))
    ) {
      return;
    }

    restoreBundledQuestionBank();
  };

  const exportQuestionBank = () => downloadJson('questions.json', questionBank);

  const pendingExplanationQuestions = useMemo(
    () => questionBank.filter(needsExplanations),
    [questionBank],
  );

  /** Applied to the latest bank, so edits made while the batch runs are kept. */
  const applyBatchReview = (questionId: string, review: AiReview) => {
    setStoredBank((current) => {
      const question = current.questions.find((item) => item.id === questionId);
      const filled = question && fillExplanationsFromReview(question, review);

      return filled
        ? {
            ...current,
            modified: true,
            questions: current.questions.map((item) => (item.id === questionId ? filled : item)),
          }
        : current;
    });
  };

  const startBatchAskAi = async () => {
    if (!aiSettings.apiKey.trim()) {
      await dialog.alert({
        title: 'API key needed',
        message: 'Add your OpenRouter API key in Settings first.',
        okLabel: 'Open Settings',
      });
      openSettings('bank');
      return;
    }

    const count = pendingExplanationQuestions.length;
    if (
      !(await dialog.confirm({
        title: `Ask AI about ${count} ${count === 1 ? 'question' : 'questions'}?`,
        message:
          `They are sent to OpenRouter (${aiSettings.model.trim() || DEFAULT_AI_MODEL}) one at a ` +
          'time, and each request uses your API key. Explanations are filled in only where the ' +
          'AI agrees with your answer key.',
        confirmLabel: 'Send to OpenRouter',
      }))
    ) {
      return;
    }

    void batchAi.start(pendingExplanationQuestions, aiSettings, applyBatchReview);
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Personal mock exam platform</p>
          <h1>Mock Exam</h1>
          <p className="hero-copy">
            Practice shuffled multiple-choice questions, review before final submission, and keep
            correct/wrong results on this device.
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
            topicScores={topicScores}
            trend={examTrend}
            onContinue={() => navigate('session')}
            onStart={(mode) => startSession(mode)}
            onPracticeMistakes={() => startSession('practice', mistakeIds)}
            onPracticeFlagged={() => startSession('practice', flaggedIds)}
            onPracticeFocus={() => startSession('practice', focusIds)}
            onPracticeTopic={practiceTopic}
            onViewAttempt={viewAttempt}
            onOpenBank={() => navigate('bank')}
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
          note={notes[currentQuestion.id] ?? ''}
          onNoteChange={(text) => changeNote(currentQuestion.id, text)}
          onSelect={(optionId) =>
            dispatchSession({ type: 'select', question: currentQuestion, optionId })
          }
          onNext={() => moveQuestion(1)}
          onPrevious={() => moveQuestion(-1)}
          onToggleFlag={() =>
            dispatchSession({ type: 'toggleFlag', questionId: currentQuestion.id })
          }
          onReview={openReview}
          onSubmitPractice={() =>
            dispatchSession({ type: 'submit', questionId: currentQuestion.id })
          }
          onFinishPractice={() => endSession()}
          onDiscard={resetCurrentSession}
          onMenu={() => goBack('home')}
        />
      )}

      {screen === 'review' && session && (
        <ReviewView
          session={session}
          questionById={questionById}
          answeredCount={answeredCount}
          remainingMs={remainingMs}
          onGoToQuestion={goToQuestion}
          onBack={closeReview}
          onSubmit={() => endSession()}
        />
      )}

      {screen === 'results' && latestAttempt && (
        <ResultsView
          attempt={latestAttempt}
          questionById={questionById}
          notes={notes}
          targetScorePercent={examSettings.targetScorePercent}
          onNoteChange={changeNote}
          retryCount={getWrongQuestionIds(latestAttempt, questionById).length}
          flaggedCount={getFlaggedResultIds(latestAttempt, questionById).length}
          onHome={() => goBack('home')}
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
          questionById={questionById}
          stats={questionStats}
          notes={notes}
          importPlan={bankImport.plan}
          onApplyImport={bankImport.apply}
          onCancelImport={bankImport.cancel}
          pendingExplanationCount={pendingExplanationQuestions.length}
          batch={batchAi.state}
          onStartBatch={startBatchAskAi}
          onCancelBatch={batchAi.cancel}
          onDismissBatch={batchAi.dismiss}
          defaultCount={BUNDLED_BANK.questions.length}
          onBack={() => goBack('home')}
          onAdd={() => editor.open(createEmptyQuestionForm())}
          onEdit={(question) => editor.open(questionToForm(question))}
          onDuplicate={duplicateQuestion}
          onDelete={deleteQuestion}
          onImport={bankImport.chooseFile}
          onExport={exportQuestionBank}
          onReset={resetQuestionBank}
        />
      )}

      {screen === 'question-form' && (
        <QuestionFormView
          form={editor.form}
          errors={editor.errors}
          warnings={editor.warnings}
          aiSettings={aiSettings}
          aiStatus={editor.aiStatus}
          aiReview={editor.aiReview}
          topics={topics}
          onChange={editor.setForm}
          onCancel={editor.close}
          onSave={editor.save}
          onDelete={editor.form.id ? deleteQuestion : undefined}
          onAskAi={editor.askAi}
          onApplyAiReview={editor.applyAiReview}
          onDismissAiReview={editor.dismissAiReview}
          onOpenAiSettings={() => openSettings('question-form')}
        />
      )}

      {screen === 'settings' && (
        <SettingsView
          examSettings={examSettings}
          aiSettings={aiSettings}
          onExamSettingsChange={setExamSettings}
          onAiSettingsChange={setAiSettings}
          onBack={() => goBack(settingsReturnScreen)}
        />
      )}
    </main>
  );
}

export default App;
