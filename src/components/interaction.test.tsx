// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Attempt, Question } from '../types';
import { makeQuestion } from '../test/fixtures';
import { buildQuestionMap } from '../lib/questionBank';
import { createSession, DEFAULT_EXAM_SETTINGS } from '../lib/session';
import { ATTEMPTS_KEY, NOTES_KEY } from '../lib/storage';
import { useDialog, type DialogApi } from '../hooks/useDialog';

// The app under test gets a small made-up bank instead of the bundled questions.json, whose
// size and content differ between machines.
vi.mock('../lib/bundledBank', async () => {
  const { createBundledBank } = await import('../lib/questionBank');
  const { makeQuestion: make } = await import('../test/fixtures');
  return {
    BUNDLED_BANK: createBundledBank([
      { ...make('q1'), topic: 'Security' },
      { ...make('q2'), topic: 'Cost' },
      make('q3'),
    ]),
  };
});

const { default: App } = await import('../App');
const { ResultsView } = await import('./ResultsView');
const { ReviewView } = await import('./ReviewView');
const { DialogProvider } = await import('./DialogProvider');

const bank: Question[] = [makeQuestion('q1'), makeQuestion('q2'), makeQuestion('q3')];
const questionById = buildQuestionMap(bank);
const pressed = (name: RegExp) => screen.getByRole('button', { name, pressed: false });

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState(null, '', '#/');
  vi.stubGlobal('scrollTo', vi.fn());
  // jsdom has no media queries; the app asks whether it runs as an installed app.
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  // jsdom has no layout, so scrolling an element into view is not implemented.
  Element.prototype.scrollIntoView = vi.fn();
  // jsdom has <dialog> but not its modal API. This stands in for the part the app uses.
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement, value?: string) {
    if (!this.hasAttribute('open')) {
      return;
    }
    if (value !== undefined) {
      this.returnValue = value;
    }
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

const renderApp = () =>
  render(
    <DialogProvider>
      <App />
    </DialogProvider>,
  );

afterEach(cleanup);

describe('ReviewView filters', () => {
  it('shows only unanswered questions and jumps to the right one', () => {
    const onGoToQuestion = vi.fn();
    render(
      <ReviewView
        session={{
          ...createSession('exam', bank, { ...DEFAULT_EXAM_SETTINGS, shuffleQuestions: false }),
          selections: { q1: ['A'], q2: ['B'] },
          flaggedQuestionIds: ['q2'],
        }}
        questionById={questionById}
        answeredCount={2}
        remainingMs={null}
        onGoToQuestion={onGoToQuestion}
        onBack={() => {}}
        onSubmit={() => {}}
      />,
    );

    expect(screen.getAllByRole('button', { name: /^Question \d/ })).toHaveLength(3);

    fireEvent.click(pressed(/^Unanswered/));
    const shown = screen.getAllByRole('button', { name: /^Question \d/ });
    expect(shown).toHaveLength(1);
    // The third question keeps its number and its position in the session.
    expect(shown[0].textContent).toContain('Question 3');
    fireEvent.click(shown[0]);
    expect(onGoToQuestion).toHaveBeenCalledWith(2);

    fireEvent.click(pressed(/^Flagged/));
    expect(screen.getAllByRole('button', { name: /^Question \d/ })[0].textContent).toContain(
      'Question 2',
    );
  });
});

describe('ResultsView', () => {
  const attempt: Attempt = {
    id: '1',
    mode: 'exam',
    startedAt: '2026-03-01T10:00:00.000Z',
    completedAt: '2026-03-01T11:00:00.000Z',
    totalQuestions: 3,
    correctCount: 2,
    wrongCount: 1,
    results: [true, false, true].map((isCorrect, index) => ({
      questionId: `q${index + 1}`,
      selectedOptionIds: [isCorrect ? 'A' : 'B'],
      correctOptionIds: ['A'],
      isCorrect,
    })),
  };
  const show = (onNoteChange = vi.fn()) => {
    render(
      <ResultsView
        attempt={attempt}
        questionById={questionById}
        notes={{}}
        targetScorePercent={0}
        retryCount={1}
        flaggedCount={0}
        onNoteChange={onNoteChange}
        onHome={() => {}}
        onNewExam={() => {}}
        onNewPractice={() => {}}
        onRetryWrong={() => {}}
        onPracticeFlagged={() => {}}
      />,
    );
    return onNoteChange;
  };

  it('filters to wrong answers without renumbering them', () => {
    show();
    expect(screen.getAllByRole('article').length).toBeGreaterThan(3);

    fireEvent.click(pressed(/^Wrong/));
    const cards = screen.getAllByRole('article').filter((card) => card.className === 'result-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toContain('Question 2');

    fireEvent.click(pressed(/^Flagged/));
    expect(screen.getByText('No flagged questions.')).toBeTruthy();
  });

  it('saves a note when the box loses focus, not on every keystroke', () => {
    const onNoteChange = show();
    const box = screen.getAllByLabelText('My note')[1];

    fireEvent.change(box, { target: { value: 'mixed' } });
    fireEvent.change(box, { target: { value: 'mixed these up' } });
    expect(onNoteChange).not.toHaveBeenCalled();

    fireEvent.blur(box);
    expect(onNoteChange).toHaveBeenCalledTimes(1);
    expect(onNoteChange).toHaveBeenCalledWith('q2', 'mixed these up');
  });
});

describe('DialogProvider', () => {
  const showProvider = () => {
    let api: DialogApi | undefined;
    function Grab() {
      api = useDialog();
      return null;
    }
    render(
      <DialogProvider>
        <Grab />
      </DialogProvider>,
    );
    return api!;
  };

  it('resolves true only for the confirm button, and focuses the safe choice first', async () => {
    const dialog = showProvider();
    let answer: Promise<boolean> = Promise.resolve(true);

    act(() => {
      answer = dialog.confirm({ title: 'Delete it?', confirmLabel: 'Delete', destructive: true });
    });
    expect(screen.getByRole('dialog', { name: 'Delete it?' })).toBeTruthy();
    expect(document.activeElement?.textContent).toBe('Cancel');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await expect(answer).resolves.toBe(false);
    expect(screen.queryByRole('dialog')).toBeNull();

    act(() => {
      answer = dialog.confirm({ title: 'Delete it?', confirmLabel: 'Delete' });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await expect(answer).resolves.toBe(true);
  });

  it('cancels an open request when a newer one arrives', async () => {
    const dialog = showProvider();
    let first: Promise<boolean> = Promise.resolve(true);

    act(() => {
      first = dialog.confirm({ title: 'First?', confirmLabel: 'Yes' });
      void dialog.alert({ title: 'Second' });
    });

    await expect(first).resolves.toBe(false);
    expect(screen.getByRole('dialog', { name: 'Second' })).toBeTruthy();
  });
});

describe('App', () => {
  const stored = <T,>(key: string): T => JSON.parse(localStorage.getItem(key) ?? 'null') as T;
  const answerCurrentQuestion = () => {
    fireEvent.click(screen.getAllByRole('radio')[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
  };

  it('runs a topic drill, saves it as a drill with a note, and reopens it from the history', async () => {
    renderApp();
    expect(screen.getByText('questions loaded').previousSibling?.textContent).toBe('3');

    const securityRow = screen.getByRole('row', { name: /Security/ });
    fireEvent.click(within(securityRow).getByRole('button', { name: 'Practice' }));
    expect(screen.getByRole('heading', { name: 'Question 1 of 1' })).toBeTruthy();

    answerCurrentQuestion();
    fireEvent.change(screen.getByLabelText('My note'), { target: { value: 'remember this' } });
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));

    expect(screen.getByText(/Drill results/)).toBeTruthy();
    expect(stored<Attempt[]>(ATTEMPTS_KEY)).toMatchObject([{ mode: 'practice', drill: true }]);
    expect(stored<Record<string, string>>(NOTES_KEY)).toEqual({ q1: 'remember this' });

    fireEvent.click(screen.getByRole('button', { name: 'Home' }));
    // Going home is a browser "back", which finishes a moment later. The button sits in a
    // collapsed history item, so it is hidden until that item is opened.
    fireEvent.click(
      await screen.findByRole('button', { name: 'View answers and explanations', hidden: true }),
    );
    expect(screen.getByText(/Drill results/)).toBeTruthy();
    expect((screen.getByLabelText('My note') as HTMLTextAreaElement).value).toBe('remember this');
  });

  it('asks before discarding a session, and keeps it when the user says so', async () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: /Practice mode/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));

    const dialog = await screen.findByRole('dialog', { name: 'Discard this session?' });
    // The question's keyboard shortcuts must not act behind the open dialog.
    fireEvent.keyDown(window, { key: '1' });
    fireEvent.keyDown(window, { key: 'f' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep going' }));
    expect(await screen.findByRole('heading', { name: /^Question 1 of/ })).toBeTruthy();
    expect(screen.getAllByRole('radio').some((radio) => (radio as HTMLInputElement).checked)).toBe(
      false,
    );
    expect(screen.queryByText('Flagged')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Discard session' }));
    expect(await screen.findByRole('button', { name: /Practice mode/, hidden: true })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('marks a full exam against the target score', () => {
    renderApp();
    fireEvent.click(screen.getByRole('button', { name: /Exam mode/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Review & submit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit final answers' }));

    expect(screen.getByRole('status').textContent).toBe(
      'Below target: 0% is under your 75% target.',
    );
    expect(stored<Attempt[]>(ATTEMPTS_KEY)[0]).not.toHaveProperty('drill');
  });
});
