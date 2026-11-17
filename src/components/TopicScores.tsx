import { topicPercent, type TopicScore } from '../lib/stats';

type TopicScoresProps = {
  scores: TopicScore[];
  /** Shown when a topic has no answers yet. */
  emptyLabel?: string;
  /** Adds a Practice button per topic. */
  onPractice?: (topic: string) => void;
};

/** A table of topics with how many answers were correct in each. */
export function TopicScores({
  scores,
  emptyLabel = 'Not answered yet',
  onPractice,
}: TopicScoresProps) {
  return (
    <table className="topic-table">
      <thead>
        <tr>
          <th scope="col">Topic</th>
          <th scope="col">Correct</th>
          <th scope="col">Score</th>
          {onPractice && <th scope="col">{/* Practice buttons */}</th>}
        </tr>
      </thead>
      <tbody>
        {scores.map((score) => {
          const percent = topicPercent(score);

          return (
            <tr key={score.topic}>
              <th scope="row">
                {score.topic}
                {onPractice && (
                  <small>
                    {score.questionCount} {score.questionCount === 1 ? 'question' : 'questions'}
                  </small>
                )}
              </th>
              <td>{percent === null ? '–' : `${score.correct} of ${score.answered}`}</td>
              <td>{percent === null ? emptyLabel : `${percent}%`}</td>
              {onPractice && (
                <td>
                  <button className="secondary-button" onClick={() => onPractice(score.topic)}>
                    Practice
                  </button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
