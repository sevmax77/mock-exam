import { useMemo, useState } from 'react';
import type { Question } from '../types';
import {
  applyBankImport,
  planBankImport,
  validateQuestionBank,
  type BankImportMode,
} from '../lib/questionBank';

/**
 * Importing a questions file into the bank. Choosing a file changes nothing: `plan` describes
 * what the file holds, and `apply` brings it in the way the user picks.
 */
export function useBankImport(
  questionBank: Question[],
  saveQuestionBank: (questions: Question[]) => void,
) {
  const [pending, setPending] = useState<Question[] | null>(null);
  // Planned against the bank as it is now, so edits made while the panel is open are respected.
  const plan = useMemo(
    () => (pending ? planBankImport(questionBank, pending) : null),
    [pending, questionBank],
  );

  const chooseFile = async (file: File) => {
    try {
      setPending(validateQuestionBank(JSON.parse(await file.text())));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not import the selected file.');
    }
  };

  const apply = (mode: BankImportMode) => {
    if (!plan) {
      return;
    }

    if (
      mode === 'replace' &&
      !window.confirm(
        `Replace the current ${questionBank.length} questions with ` +
          `${plan.imported.length} imported questions?`,
      )
    ) {
      return;
    }

    saveQuestionBank(applyBankImport(questionBank, plan, mode));
    setPending(null);
  };

  return { plan, chooseFile, apply, cancel: () => setPending(null) };
}
