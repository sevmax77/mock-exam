import type { Attempt, Question } from '../types';
import { formatDate, truncate } from '../lib/format';
import { scorePercentage } from '../lib/scoring';

type HistoryProps = {
  attempts: Attempt[];
  questionById: Map<string, Question>;
  onClear: () => void;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
};

function ImportButton({ onImport }: { onImport: (file: File) => Promise<void> }) {
  return (
    <label className="secondary-button file-button">
      Import backup
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
  );
}

export function History({ attempts, questionById, onClear, onExport, onImport }: HistoryProps) {
  if (!attempts.length) {
    return (
      <section className="panel">
        <h2>Saved history</h2>
        <p>No completed attempts yet. Your results will be saved on this device.</p>
        <div className="history-actions">
          <ImportButton onImport={onImport} />
        </div>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="session-bar">
        <div>
          <p className="eyebrow">Saved on this device</p>
          <h2>Attempt history</h2>
        </div>
        <div className="history-actions">
          <button className="secondary-button" onClick={onExport}>
            Export backup
          </button>
          <ImportButton onImport={onImport} />
          <button className="ghost-button" onClick={onClear}>
            Clear history
          </button>
        </div>
      </div>

      <div className="history-list">
        {attempts.map((attempt) => {
          const wrongQuestions = attempt.results.filter((result) => !result.isCorrect);
          const percentage = scorePercentage(attempt);

          return (
            <details key={attempt.id} className="history-item">
              <summary>
                <span>
                  {attempt.mode === 'exam' ? 'Exam' : 'Practice'} - {formatDate(attempt.completedAt)}
                </span>
                <strong>{percentage}%</strong>
              </summary>
              <p>
                Correct {attempt.correctCount}, wrong {attempt.wrongCount}, total{' '}
                {attempt.totalQuestions}.
                {attempt.timedOut && ' Time ran out.'}
              </p>
              {wrongQuestions.length > 0 && (
                <ul>
                  {wrongQuestions.map((result) => {
                    const question = questionById.get(result.questionId);
                    return (
                      <li key={result.questionId}>
                        {question ? truncate(question.question, 160) : '(question deleted)'}
                      </li>
                    );
                  })}
                </ul>
              )}
            </details>
          );
        })}
      </div>
    </section>
  );
}
