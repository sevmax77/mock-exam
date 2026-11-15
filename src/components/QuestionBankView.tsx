import { useState } from 'react';
import type { Question } from '../types';

type QuestionBankViewProps = {
  questions: Question[];
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

export function QuestionBankView({
  questions,
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
  const searchText = search.trim().toLowerCase();
  const filteredQuestions = searchText
    ? questions.filter((question) =>
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
    : questions;
  const singleAnswerCount = questions.filter((question) => question.correctOptionIds.length === 1).length;
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

      <div className="bank-list">
        {filteredQuestions.map((question, index) => (
          <article className="bank-card" key={question.id}>
            <div>
              <p className="eyebrow">
                Question {index + 1} of {filteredQuestions.length}
              </p>
              <h3>{question.question}</h3>
              <div className="question-meta">
                <span>{question.correctOptionIds.length === 1 ? 'Single answer' : `Choose ${question.correctOptionIds.length}`}</span>
                <span>{question.options.length} options</span>
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

      {!filteredQuestions.length && (
        <p className="empty-note">No questions match your search.</p>
      )}
    </section>
  );
}
