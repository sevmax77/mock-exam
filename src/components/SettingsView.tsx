import { DEFAULT_AI_MODEL, type AiSettings } from '../lib/ai';
import type { ExamSettings } from '../lib/session';

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
          <h3>Session order</h3>
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
              onChange={(event) =>
                onAiSettingsChange({ ...aiSettings, model: event.target.value })
              }
              placeholder={DEFAULT_AI_MODEL}
            />
          </label>

          <div className="ai-panel">
            <p>
              Ask AI reviews each question as an AWS Certified Generative AI Developer -
              Professional AIP-C01 exam item. It returns recommended correct option IDs,
              confidence, notes, per-option explanations, and an optional summary. The result is
              only applied after you preview and choose an action.
            </p>
            <p>
              Your API key is stored only in this browser using localStorage. Do not use this
              setup for a public app.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
