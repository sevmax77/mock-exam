import { useMemo, useState } from 'react';
import type { Question } from '../types';
import { useDialog } from './useDialog';
import { useLatest } from './useLatest';
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
  const dialog = useDialog();
  const currentBankRef = useLatest(questionBank);
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
      await dialog.alert({
        title: 'Could not import questions',
        message: error instanceof Error ? error.message : 'Could not import the selected file.',
      });
    }
  };

  const apply = async (mode: BankImportMode) => {
    if (!plan || !pending) {
      return;
    }

    if (
      mode === 'replace' &&
      !(await dialog.confirm({
        title: 'Replace the whole bank?',
        message:
          `The current ${questionBank.length} questions are replaced by the ` +
          `${plan.imported.length} imported ones.`,
        confirmLabel: 'Replace bank',
        destructive: true,
      }))
    ) {
      return;
    }

    // Planned again against the latest bank, which may have changed while the dialog was open.
    const latestBank = currentBankRef.current;
    saveQuestionBank(applyBankImport(latestBank, planBankImport(latestBank, pending), mode));
    setPending(null);
  };

  return { plan, chooseFile, apply, cancel: () => setPending(null) };
}
