import type { Attempt, Question } from '../types';
import { formatDate, truncate } from '../lib/format';
import { scorePercentage } from '../lib/scoring';

type HistoryProps = {
  attempts: Attempt[];
  questionById: Map<string, Question>;
  onClear: () => void;
};

export function History({ attempts, questionById, onClear }: HistoryProps) {
  if (!attempts.length) {
    return (
      <section className="panel">
        <h2>Saved history</h2>
        <p>No completed attempts yet. Your results will be saved on this device.</p>
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
        <button className="ghost-button" onClick={onClear}>
          Clear history
        </button>
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
