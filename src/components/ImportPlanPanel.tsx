import type { BankImportMode, BankImportPlan } from '../lib/questionBank';

type ImportPlanPanelProps = {
  plan: BankImportPlan;
  currentCount: number;
  onApply: (mode: BankImportMode) => void;
  onCancel: () => void;
};

const questions = (count: number) => `${count} ${count === 1 ? 'question' : 'questions'}`;

/** Shown after a file is chosen: what it contains, and the ways to bring it into the bank. */
export function ImportPlanPanel({ plan, currentCount, onApply, onCancel }: ImportPlanPanelProps) {
  const added = plan.added.length;
  const changed = plan.changed.length;

  return (
    <div className="notice-panel notice-panel-info import-plan" role="region" aria-label="Import">
      <h3>Import {questions(plan.imported.length)}</h3>
      <ul>
        <li>
          <strong>{added}</strong> new
        </li>
        <li>
          <strong>{changed}</strong> already in your bank, with different answers, options,
          explanations or topic
        </li>
        <li>
          <strong>{plan.unchangedCount}</strong> already in your bank, identical
        </li>
      </ul>
      <p className="field-hint">
        Questions are matched by their text, not their id, so a reworded question counts as new.
        Adding and updating keep your history and notes; replacing keeps them only for questions
        whose id stays the same.
      </p>
      <div className="notice-actions">
        <button className="primary-button" disabled={!added} onClick={() => onApply('add-new')}>
          Add {added} new
        </button>
        {changed > 0 && (
          <button className="secondary-button" onClick={() => onApply('add-and-update')}>
            Add {added} new and update {changed}
          </button>
        )}
        <button className="ghost-button danger-button" onClick={() => onApply('replace')}>
          Replace all {currentCount}
        </button>
        <button className="ghost-button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
