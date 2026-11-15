import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const inputPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(projectRoot, 'src', 'data', 'questions copy.json');
const outputPath = process.argv[3]
  ? path.resolve(process.argv[3])
  : path.join(projectRoot, 'src', 'data', 'questions.json');

const SECTION_START =
  /^(?:why the other|why other|why the remaining|conclusion|references|solution justification|justification)\b/i;
const BULLET_OPTION =
  /^[-*•]\s*(?:Option\s*)?([A-F])\s*[:.)–—-]\s*(.*)$/i;
const WHY_OPTION = /^Why\s+option\s+([A-F])\s+is\b(.*)$/i;
const OPTION_LINE = /^Option\s*([A-F])\b[:.]?\s*(.*)$/i;

function normalizeOptionId(value) {
  return String(value).trim().toUpperCase();
}

function appendText(current, addition) {
  const next = addition.trim();
  if (!next) {
    return current;
  }
  return current ? `${current}\n\n${next}` : next;
}

function defaultExplanation(optionId, isCorrect) {
  return isCorrect
    ? 'Correct answer for this question. See the summary for additional context.'
    : 'Not the best choice for this scenario.';
}

function isSectionStart(line) {
  return SECTION_START.test(line.trim());
}

function isOptionMarker(line) {
  const trimmed = line.trim();
  return (
    BULLET_OPTION.test(trimmed) ||
    WHY_OPTION.test(trimmed) ||
    OPTION_LINE.test(trimmed) ||
    isSectionStart(trimmed)
  );
}

function extractParenSentences(text, optionIds, extracted) {
  let remaining = text;

  for (const optionId of optionIds) {
    const pattern = new RegExp(`([^.!?\\n]*?\\(${optionId}\\)[^.!?\\n]*[.!?])`, 'gi');
    remaining = remaining.replace(pattern, (match) => {
      extracted[optionId] = appendText(extracted[optionId], match.trim());
      return ' ';
    });
  }

  return remaining.replace(/\s+/g, ' ').trim();
}

function splitExplanation(explanation, optionIds, correctOptionIds) {
  const extracted = Object.fromEntries(optionIds.map((id) => [id, '']));
  const summaryParts = [];
  const lines = explanation.replace(/\r/g, '').split('\n');
  let section = 'body';

  for (let index = 0; index < lines.length; ) {
    const line = lines[index].trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (isSectionStart(line)) {
      const lower = line.toLowerCase();
      if (lower.startsWith('why')) {
        section = 'wrong-options';
      } else if (lower.startsWith('justification') || lower.startsWith('solution justification')) {
        section = 'justification';
      } else {
        section = 'summary-section';
      }
      summaryParts.push(line);
      index += 1;
      continue;
    }

    const bulletMatch = line.match(BULLET_OPTION);
    if (bulletMatch) {
      const optionId = normalizeOptionId(bulletMatch[1]);
      if (optionIds.includes(optionId)) {
        let content = bulletMatch[2]?.trim() ?? '';
        index += 1;
        while (index < lines.length) {
          const nextLine = lines[index].trim();
          if (!nextLine || isOptionMarker(nextLine)) {
            break;
          }
          content = appendText(content, nextLine);
          index += 1;
        }
        extracted[optionId] = appendText(extracted[optionId], content);
        continue;
      }
    }

    const whyMatch = line.match(WHY_OPTION);
    if (whyMatch) {
      const optionId = normalizeOptionId(whyMatch[1]);
      if (optionIds.includes(optionId)) {
        let content = `Why option ${optionId} is${whyMatch[2] ?? ''}`.trim();
        index += 1;
        while (index < lines.length) {
          const nextLine = lines[index].trim();
          if (!nextLine || isOptionMarker(nextLine)) {
            break;
          }
          content = appendText(content, nextLine);
          index += 1;
        }
        extracted[optionId] = appendText(extracted[optionId], content);
        continue;
      }
    }

    const optionMatch = line.match(OPTION_LINE);
    if (optionMatch && section === 'wrong-options') {
      const optionId = normalizeOptionId(optionMatch[1]);
      if (optionIds.includes(optionId)) {
        let content = line;
        index += 1;
        while (index < lines.length) {
          const nextLine = lines[index].trim();
          if (!nextLine || isOptionMarker(nextLine)) {
            break;
          }
          content = appendText(content, nextLine);
          index += 1;
        }
        extracted[optionId] = appendText(extracted[optionId], content);
        continue;
      }
    }

    if (section === 'justification' || section === 'body') {
      const withoutParenSentences = extractParenSentences(line, optionIds, extracted);
      if (withoutParenSentences) {
        summaryParts.push(withoutParenSentences);
      }
    } else {
      summaryParts.push(line);
    }

    index += 1;
  }

  if (explanation.trim().match(/^[-*•]\s*(?:Option\s*)?([A-F])\s*[:.)–—-]/i)) {
    const single = explanation.trim().match(/^[-*•]\s*(?:Option\s*)?([A-F])\s*[:.)–—-]\s*(.*)$/is);
    if (single) {
      const optionId = normalizeOptionId(single[1]);
      if (optionIds.includes(optionId) && !extracted[optionId]) {
        extracted[optionId] = single[2].trim();
        summaryParts.length = 0;
      }
    }
  }

  const correctSet = new Set(correctOptionIds);
  for (const optionId of optionIds) {
    if (!extracted[optionId]?.trim()) {
      extracted[optionId] = defaultExplanation(optionId, correctSet.has(optionId));
    }
  }

  const summary = summaryParts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim();
  return { extracted, summary };
}

function migrateQuestion(question) {
  if (
    question.options.every(
      (option) => typeof option.explanation === 'string' && option.explanation.trim(),
    ) &&
    !question.explanation
  ) {
    return {
      id: question.id,
      question: question.question,
      options: question.options.map((option) => ({
        id: normalizeOptionId(option.id),
        text: option.text,
        explanation: option.explanation.trim(),
      })),
      correctOptionIds: question.correctOptionIds.map(normalizeOptionId),
      summary: typeof question.summary === 'string' ? question.summary.trim() : '',
    };
  }

  const legacyExplanation =
    typeof question.explanation === 'string' ? question.explanation.trim() : '';
  const optionIds = question.options.map((option) => normalizeOptionId(option.id));
  const correctOptionIds = question.correctOptionIds.map(normalizeOptionId);
  const { extracted, summary } = splitExplanation(
    legacyExplanation,
    optionIds,
    correctOptionIds,
  );

  return {
    id: question.id,
    question: question.question,
    options: question.options.map((option) => {
      const optionId = normalizeOptionId(option.id);
      return {
        id: optionId,
        text: option.text,
        explanation: extracted[optionId],
      };
    }),
    correctOptionIds,
    summary,
  };
}

const questions = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const migratedQuestions = questions.map(migrateQuestion);

const stats = {
  questions: migratedQuestions.length,
  withSummary: migratedQuestions.filter((question) => question.summary).length,
  defaultFilled: migratedQuestions.reduce(
    (count, question) =>
      count +
      question.options.filter((option) =>
        /Correct answer for this question|Not the best choice for this scenario/.test(
          option.explanation,
        ),
      ).length,
    0,
  ),
};

fs.writeFileSync(outputPath, `${JSON.stringify(migratedQuestions, null, 2)}\n`, 'utf8');

console.log(`Migrated ${inputPath} -> ${outputPath}`);
console.log(JSON.stringify(stats, null, 2));
