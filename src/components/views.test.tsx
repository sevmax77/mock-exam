import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Attempt, Question } from '../types';
import { makeQuestion } from '../test/fixtures';
import { buildQuestionMap, planBankImport } from '../lib/questionBank';
import { createSession, DEFAULT_EXAM_SETTINGS } from '../lib/session';
import { getExamTrend } from '../lib/stats';
import { History } from './History';
import { ImportPlanPanel } from './ImportPlanPanel';
import { ResultsView } from './ResultsView';
import { ReviewView } from './ReviewView';

// These render each view once, as the server would, and check what the first render shows.
// Clicks are covered by the browser check described in the README, not here.

const noop = () => {};
const text = (element: ReactElement) =>
  renderToStaticMarkup(element)
    .replace(/<!--.*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');

const bank: Question[] = [
  { ...makeQuestion('q1'), topic: 'Security' },
  { ...makeQuestion('q2'), topic: 'Cost' },
  makeQuestion('q3'),
];
const questionById = buildQuestionMap(bank);

const attempt = (id: string, correct: boolean[], extra: Partial<Attempt> = {}): Attempt => ({
  id,
  mode: 'exam',
  startedAt: `2026-03-0${id}T10:00:00.000Z`,
  completedAt: `2026-03-0${id}T11:00:00.000Z`,
  totalQuestions: correct.length,
  correctCount: correct.filter(Boolean).length,
  wrongCount: correct.filter((value) => !value).length,
  results: correct.map((isCorrect, index) => ({
    questionId: `q${index + 1}`,
    selectedOptionIds: [isCorrect ? 'A' : 'B'],
    correctOptionIds: ['A'],
    isCorrect,
    ...(index === 1 ? { flagged: true } : {}),
  })),
  ...extra,
});

const results = (shown: Attempt, targetScorePercent: number) => (
  <ResultsView
    attempt={shown}
    questionById={questionById}
    notes={{ q2: 'mixed these up' }}
    targetScorePercent={targetScorePercent}
    retryCount={1}
    flaggedCount={1}
    onNoteChange={noop}
    onHome={noop}
    onNewExam={noop}
    onNewPractice={noop}
    onRetryWrong={noop}
    onPracticeFlagged={noop}
  />
);

describe('ResultsView', () => {
  it('shows the target outcome, the score by topic, filters and saved notes', () => {
    const page = text(results(attempt('1', [true, false, true]), 60));

    expect(page).toContain('Target reached: 67% is at or above your 60% target.');
    expect(page).toContain('Score by topic');
    expect(page).toContain('Security 1 of 1 100%');
    expect(page).toContain('Cost 0 of 1 0%');
    expect(page).toContain('All 3');
    expect(page).toContain('Wrong 1');
    expect(page).toContain('Flagged 1');
    expect(page).toContain('mixed these up');
  });

  it('says when an exam is below the target', () => {
    expect(text(results(attempt('1', [true, false, false]), 60))).toContain(
      'Below target: 33% is under your 60% target.',
    );
  });

  it('shows no target for drills, practice runs, or when the target is off', () => {
    const exam = attempt('1', [true, false, true]);

    expect(text(results({ ...exam, drill: true }, 60))).not.toContain('target');
    expect(text(results({ ...exam, mode: 'practice' }, 60))).not.toContain('target');
    expect(text(results(exam, 0))).not.toContain('target');
  });
});

describe('History', () => {
  const attempts = [
    attempt('3', [true], { mode: 'practice', drill: true }),
    attempt('2', [true, true, false]),
    attempt('1', [true, false, false]),
  ];
  const history = (shown: Attempt[]) => (
    <History
      attempts={shown}
      questionById={questionById}
      trend={getExamTrend(shown)}
      targetScorePercent={60}
      onView={noop}
      onClear={noop}
      onExport={noop}
      onImport={async () => {}}
    />
  );

  it('labels drills, marks exams against the target, and offers the full results', () => {
    const page = text(history(attempts));

    expect(page).toContain('Drill - ');
    expect(page).toContain('67% Target reached');
    expect(page).toContain('33% Below target');
    expect(page).toContain('View answers and explanations');
  });

  it('draws the trend only from full exams, and only when there are at least two', () => {
    const page = renderToStaticMarkup(history(attempts));

    expect(page.match(/class="trend-point/g)).toHaveLength(2);
    expect(page).toContain('Target 60%');
    expect(renderToStaticMarkup(history(attempts.slice(0, 2)))).not.toContain('score-trend');
  });
});

describe('ReviewView', () => {
  it('counts unanswered and flagged questions on the filters', () => {
    const session = {
      ...createSession('exam', bank, { ...DEFAULT_EXAM_SETTINGS, shuffleQuestions: false }),
      selections: { q1: ['A'] },
      flaggedQuestionIds: ['q3'],
    };
    const page = text(
      <ReviewView
        session={session}
        questionById={questionById}
        answeredCount={1}
        remainingMs={null}
        onGoToQuestion={noop}
        onBack={noop}
        onSubmit={noop}
      />,
    );

    expect(page).toContain('All 3');
    expect(page).toContain('Unanswered 2');
    expect(page).toContain('Flagged 1');
  });
});

describe('ImportPlanPanel', () => {
  it('describes the file and offers updating only when something changed', () => {
    const changed = { ...bank[0], correctOptionIds: ['B'] };
    const added = { ...makeQuestion('q9'), question: 'A new one?' };
    const panel = (imported: Question[]) =>
      text(
        <ImportPlanPanel
          plan={planBankImport(bank, imported)}
          currentCount={bank.length}
          onApply={noop}
          onCancel={noop}
        />,
      );

    expect(panel([bank[1], changed, added])).toContain('Add 1 new and update 1');
    expect(panel([bank[1], added])).not.toContain('update');
    expect(panel([bank[1], added])).toContain('Replace all 3');
  });
});
