import {
  DEFAULT_AI_GUIDANCE,
  DEFAULT_AI_MODEL,
  DEFAULT_EXAM_NAME,
  examLabel,
  type AiSettings,
} from '../lib/ai';
import type { ExamSettings } from '../lib/session';

function toWholeNumber(value: string): number {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

type SettingsViewProps = {
  examSettings: ExamSettings;
  aiSettings: AiSettings;
  onExamSettingsChange: (settings: ExamSettings) => void;
  onAiSettingsChange: (settings: AiSettings) => void;
  onBack: () => void;
};

export function SettingsView({
  examSettings,
  aiSettings,
  onExamSettingsChange,
  onAiSettingsChange,
  onBack,
}: SettingsViewProps) {
  return (
    <section className="panel">
      <div className="session-bar">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Session and Ask AI</h2>
        </div>
        <button className="secondary-button" onClick={onBack}>
          Back
        </button>
      </div>

      <div className="question-form">
        <div className="settings-section">
          <h3>Sessions</h3>
          <p>
            These options apply to the next exam or practice session you start. When both are off,
            questions and answer options follow the same order as the question bank.
          </p>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={examSettings.shuffleQuestions}
              onChange={(event) =>
                onExamSettingsChange({
                  ...examSettings,
                  shuffleQuestions: event.target.checked,
                })
              }
            />
            <span>
              <strong>Shuffle questions</strong>
              <small>Randomize the order of questions in each new session.</small>
            </span>
          </label>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={examSettings.shuffleOptions}
              onChange={(event) =>
                onExamSettingsChange({
                  ...examSettings,
                  shuffleOptions: event.target.checked,
                })
              }
            />
            <span>
              <strong>Shuffle answer options</strong>
              <small>Randomize A/B/C/D labels for each question in each new session.</small>
            </span>
          </label>

          <label className="form-field">
            <span>Questions per session (0 = all)</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={examSettings.questionCount}
              onChange={(event) =>
                onExamSettingsChange({
                  ...examSettings,
                  questionCount: toWholeNumber(event.target.value),
                })
              }
            />
            <small className="field-hint">
              A smaller session picks that many questions from the bank at random.
            </small>
          </label>

          <label className="form-field">
            <span>Exam time limit in minutes (0 = no limit)</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={examSettings.timeLimitMinutes}
              onChange={(event) =>
                onExamSettingsChange({
                  ...examSettings,
                  timeLimitMinutes: toWholeNumber(event.target.value),
                })
              }
            />
            <small className="field-hint">
              Exam mode only. When time runs out, the exam is submitted automatically and unanswered
              questions count as wrong. The clock keeps running if you leave the session or close
              the app.
            </small>
          </label>
        </div>

        <div className="settings-section">
          <h3>Ask AI</h3>
          <p>Configure OpenRouter for answer review in the question bank editor.</p>

          <label className="form-field">
            <span>OpenRouter API key</span>
            <input
              type="password"
              value={aiSettings.apiKey}
              onChange={(event) =>
                onAiSettingsChange({ ...aiSettings, apiKey: event.target.value })
              }
              placeholder="sk-or-v1-..."
            />
          </label>

          <label className="form-field">
            <span>Model</span>
            <input
              type="text"
              value={aiSettings.model}
              onChange={(event) => onAiSettingsChange({ ...aiSettings, model: event.target.value })}
              placeholder={DEFAULT_AI_MODEL}
            />
          </label>

          <label className="form-field">
            <span>Exam name</span>
            <input
              type="text"
              value={aiSettings.examName}
              onChange={(event) =>
                onAiSettingsChange({ ...aiSettings, examName: event.target.value })
              }
              placeholder={DEFAULT_EXAM_NAME}
            />
            <small className="field-hint">
              The exam your questions are written for. Ask AI reviews them as items of this exam.
            </small>
          </label>

          <label className="form-field">
            <span>Reviewer guidance (optional)</span>
            <textarea
              rows={3}
              value={aiSettings.guidance}
              onChange={(event) =>
                onAiSettingsChange({ ...aiSettings, guidance: event.target.value })
              }
              placeholder="For example: prefer managed services and the least operational overhead."
            />
            <small className="field-hint">
              Extra instructions sent with every review, such as which practices the exam favors.
            </small>
          </label>

          {(aiSettings.examName !== DEFAULT_EXAM_NAME ||
            aiSettings.guidance !== DEFAULT_AI_GUIDANCE) && (
            <button
              className="ghost-button"
              onClick={() =>
                onAiSettingsChange({
                  ...aiSettings,
                  examName: DEFAULT_EXAM_NAME,
                  guidance: DEFAULT_AI_GUIDANCE,
                })
              }
            >
              Restore default exam and guidance
            </button>
          )}

          <div className="ai-panel">
            <p>
              Ask AI reviews each question as an item of {examLabel(aiSettings)}. It returns
              recommended correct option IDs, confidence, notes, per-option explanations, and an
              optional summary. In the question editor the result is only applied after you preview
              it and choose an action. The question bank can also fill missing explanations for many
              questions at once, without changing any answers.
            </p>
            <p>
              Your API key is stored only in this browser using localStorage. Do not use this setup
              for a public app.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
