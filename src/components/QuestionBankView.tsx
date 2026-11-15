import { useState } from 'react';
import type { Question } from '../types';
import { sortByWeakness, type QuestionStats } from '../lib/stats';
import type { BatchState } from '../hooks/useBatchAskAi';
import { BatchAskAiPanel } from './BatchAskAiPanel';

type QuestionBankViewProps = {
  questions: Question[];
  questionById: Map<string, Question>;
  stats: Map<string, QuestionStats>;
  /** Questions with empty or placeholder explanations. */
  pendingExplanationCount: number;
  batch: BatchState | null;
  onStartBatch: () => void;
  onCancelBatch: () => void;
  onDismissBatch: () => void;
  defaultCount: number;
  onBack: () => void;
  onAdd: () => void;
  onEdit: (question: Question) => void;
  onDuplicate: (question: Question) => void;
  onDelete: (questionId: string) => void;
  onImport: (file: File) => Promise<void>;
  onExport: () => void;
  onReset: () => void;
};

/** "Answered 3 times · 67% correct", or "Not answered yet". */
function describeStats(stat: QuestionStats | undefined): string {
  if (!stat) {
    return 'Not answered yet';
  }

  const times = stat.seen === 1 ? 'once' : `${stat.seen} times`;
  return `Answered ${times} · ${Math.round((stat.correct / stat.seen) * 100)}% correct`;
}

export function QuestionBankView({
  questions,
  questionById,
  stats,
  pendingExplanationCount,
  batch,
  onStartBatch,
  onCancelBatch,
  onDismissBatch,
  defaultCount,
  onBack,
  onAdd,
  onEdit,
  onDuplicate,
  onDelete,
  onImport,
  onExport,
  onReset,
}: QuestionBankViewProps) {
  const [search, setSearch] = useState('');
  const [weakestFirst, setWeakestFirst] = useState(false);
  const searchText = search.trim().toLowerCase();
  const orderedQuestions = weakestFirst ? sortByWeakness(questions, stats) : questions;
  const filteredQuestions = searchText
    ? orderedQuestions.filter((question) =>
        [
          question.id,
          question.question,
          question.summary,
          ...question.options.flatMap((option) => [option.text, option.explanation]),
        ]
          .join(' ')
          .toLowerCase()
          .includes(searchText),
      )
    : orderedQuestions;
  const singleAnswerCount = questions.filter(
    (question) => question.correctOptionIds.length === 1,
  ).length;
  const multiAnswerCount = questions.length - singleAnswerCount;

  return (
    <section className="panel">
      <div className="session-bar">
        <div>
          <p className="eyebrow">Question bank</p>
          <h2>Edit your questions</h2>
        </div>
        <button className="secondary-button" onClick={onBack}>
          Back to menu
        </button>
      </div>

      <div className="summary-grid bank-summary">
        <div>
          <strong>{questions.length}</strong>
          <span>questions</span>
        </div>
        <div>
          <strong>{singleAnswerCount}</strong>
          <span>single answer</span>
        </div>
        <div>
          <strong>{multiAnswerCount}</strong>
          <span>multi answer</span>
        </div>
      </div>

      <div className="bank-toolbar">
        <label className="search-field">
          <span>Search questions</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search question, option, or explanation"
          />
        </label>
        <label className="search-field">
          <span>Order</span>
          <select
            value={weakestFirst ? 'weakest' : 'bank'}
            onChange={(event) => setWeakestFirst(event.target.value === 'weakest')}
          >
            <option value="bank">Bank order</option>
            <option value="weakest">Weakest first</option>
          </select>
        </label>
        <div className="toolbar-actions">
          <button className="primary-button" onClick={onAdd}>
            Add question
          </button>
          <label className="secondary-button file-button">
            Import JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void onImport(file);
                  event.target.value = '';
                }
              }}
            />
          </label>
          <button className="secondary-button" onClick={onExport}>
            Export questions.json
          </button>
          <button className="ghost-button" onClick={onReset}>
            Reset to original ({defaultCount})
          </button>
        </div>
      </div>

      <BatchAskAiPanel
        pendingCount={pendingExplanationCount}
        batch={batch}
        questionById={questionById}
        onStart={onStartBatch}
        onCancel={onCancelBatch}
        onDismiss={onDismissBatch}
        onEdit={onEdit}
      />

      <div className="bank-list">
        {filteredQuestions.map((question, index) => (
          <article className="bank-card" key={question.id}>
            <div>
              <p className="eyebrow">
                Question {index + 1} of {filteredQuestions.length}
              </p>
              <h3>{question.question}</h3>
              <div className="question-meta">
                <span>
                  {question.correctOptionIds.length === 1
                    ? 'Single answer'
                    : `Choose ${question.correctOptionIds.length}`}
                </span>
                <span>{question.options.length} options</span>
                <span>{describeStats(stats.get(question.id))}</span>
                {stats.get(question.id)?.lastFlagged && <span className="flag-label">Flagged</span>}
              </div>
            </div>
            <div className="bank-card-actions">
              <button className="secondary-button" onClick={() => onEdit(question)}>
                Edit
              </button>
              <button className="secondary-button" onClick={() => onDuplicate(question)}>
                Duplicate
              </button>
              <button className="ghost-button danger-button" onClick={() => onDelete(question.id)}>
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>

      {!filteredQuestions.length && <p className="empty-note">No questions match your search.</p>}
    </section>
  );
}
