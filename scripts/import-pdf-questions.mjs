import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PDFParse } from 'pdf-parse';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const defaultPdfPath = path.join(
  projectRoot,
  'src',
  'data',
  'aws-certified-generative-ai-developer-professional-aip-c01.pdf',
);
const defaultOutputPath = path.join(projectRoot, 'src', 'data', 'questions.json');

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const pdfPath = getArgValue('--pdf') ?? defaultPdfPath;
const outputPath = getArgValue('--out') ?? defaultOutputPath;

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function normalizeLine(line) {
  return line
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function splitEmbeddedQuestionStart(line) {
  if (!/(References|https?:\/\/)/i.test(line)) {
    return [line];
  }

  const questionStartPattern =
    /\b(?:A|An|The)\s+(?:(?:[\w'’()-]+)\s+){0,8}(?:company|bank|university|organization|team|application|developer|government|enterprise|system)\b/gi;
  const matches = [...line.matchAll(questionStartPattern)].filter((match) => match.index > 20);
  const splitIndex = matches.at(-1)?.index;

  if (!splitIndex) {
    return [line];
  }

  return [line.slice(0, splitIndex).trim(), line.slice(splitIndex).trim()].filter(Boolean);
}

function cleanExtractedLines(text) {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map(normalizeLine)
    .flatMap(splitEmbeddedQuestionStart)
    .filter((line) => !/^--\s*\d+\s+of\s+\d+\s*--$/i.test(line))
    .filter((line) => !/CertyIQ/i.test(line))
    .filter((line) => !/^Link:\s*/i.test(line))
    .filter((line) => !/^https?:\/\/www\.CertyIQ\.com$/i.test(line))
    .filter((line) => !/^https?:\/\/www\.certyiq\.com$/i.test(line));
}

function joinInline(lines) {
  return lines
    .map(normalizeLine)
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([,.;:?!])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function joinExplanation(lines) {
  const blocks = [];
  let currentBlock = '';

  for (const rawLine of lines) {
    const line = normalizeLine(rawLine);

    if (!line || /^Explanation:$/i.test(line)) {
      continue;
    }

    if (/^(Thank you|Best of Luck|Feedback More Papers|Total:\s*\d+\s+Questions|Link:)/i.test(line)) {
      break;
    }

    const isHeading = /^(Justification|Solution justification|Technical justification|Selected Solution|Why\b|Conclusion\b|References\b|Result\b|Overall\b|Key AWS services involved|Resulting architecture)\b/i.test(
      line,
    );
    const isOptionHeading =
      /^Option\s?[A-Z]\b/i.test(line) ||
      /^[A-Z]\s*[).–-]\s+/.test(line) ||
      /^[A-Z]\s+\(/.test(line);
    const isNumberedItem = /^\d+\.\s+/.test(line);
    const isUrl = /^https?:\/\//i.test(line);
    const isShortLabel = /^[A-Z][A-Za-z\s/&-]{2,45}:$/.test(line);

    if (isHeading || isOptionHeading || isNumberedItem || isUrl || isShortLabel) {
      if (currentBlock) {
        blocks.push(currentBlock);
      }

      currentBlock = line;
      continue;
    }

    if (!currentBlock) {
      currentBlock = line;
      continue;
    }

    currentBlock = `${currentBlock} ${line}`;
  }

  if (currentBlock) {
    blocks.push(currentBlock);
  }

  return blocks
    .map(formatExplanationBlock)
    .join('\n\n')
    .replace(/\s+([,.;:?!])/g, '$1')
    .replace(/\.([A-Z])/g, '. $1')
    .replace(/\boption([A-Z])\b/g, 'option $1')
    .trim();
}

function formatExplanationBlock(block) {
  const normalized = block.replace(/[ \t]+/g, ' ').trim();

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  const headingWithTextMatch = normalized.match(
    /^(Justification|Solution justification|Technical justification|Selected Solution|Conclusion|References|Result|Overall|Key AWS services involved|Resulting architecture)\s+(.+)$/i,
  );

  if (headingWithTextMatch) {
    return `${headingWithTextMatch[1]}\n\n${headingWithTextMatch[2]}`;
  }

  if (
    /^(Justification|Solution justification|Technical justification|Selected Solution|Why\b|Conclusion\b|References\b|Result\b|Overall\b|Key AWS services involved|Resulting architecture)\b/i.test(
      normalized,
    ) &&
    normalized.length <= 90
  ) {
    return normalized;
  }

  const optionMatch = normalized.match(
    /^(?:Option\s*)?([A-Z])(?:\s*[).]\s*|\s*[–-]\s*|\s+\()(.*)$/,
  );

  if (optionMatch && normalized.length > 3) {
    const label = optionMatch[1].toUpperCase();
    const text = optionMatch[2].replace(/^[-–:)]\s*/, '').trim();
    return `- ${label}: ${text}`;
  }

  const numberedMatch = normalized.match(/^(\d+)\.\s+(.*)$/);

  if (numberedMatch) {
    return `${numberedMatch[1]}. ${numberedMatch[2]}`;
  }

  return normalized;
}

function isOptionLine(line) {
  return /^([A-Z])\.\s*(.*)$/.test(line);
}

function isAnswerLine(line) {
  const answerText = line.replace(/^Answer:\s*/i, '').trim();
  return (
    /^Answer:\s*/i.test(line) &&
    (/^[A-Z]+$/.test(answerText) ||
      /^[A-Z](?:\s*,\s*[A-Z])*(?:,?\s+and\s+[A-Z])?$/i.test(answerText))
  );
}

function isPromptLine(line) {
  return /^(Which|What|How|When|Where)\b/i.test(line);
}

function looksLikeQuestionStart(line) {
  return (
    /^(A|An|The|For|During|After|Before|In|Users|Several|Your|As)\b/i.test(line) ||
    /\b(company|organization|developer|team|bank|university|application|system|users?|customer|enterprise)\b/i.test(
      line,
    )
  );
}

function findNextIndex(lines, startIndex, predicate) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (predicate(lines[index], index)) {
      return index;
    }
  }

  return -1;
}

function findQuestionStart(lines, searchStart, optionAIndex) {
  let promptIndex = -1;

  for (let index = optionAIndex - 1; index >= searchStart; index -= 1) {
    if (isPromptLine(lines[index])) {
      promptIndex = index;
      break;
    }
  }

  const anchorIndex = promptIndex >= 0 ? promptIndex : optionAIndex;
  const lowerBound = Math.max(searchStart, anchorIndex - 40);
  let boundaryIndex = lowerBound - 1;

  for (let index = lowerBound; index <= anchorIndex; index += 1) {
    if (
      /^(References|Conclusion|Result|Overall)\b/i.test(lines[index]) ||
      /^https?:\/\//i.test(lines[index])
    ) {
      boundaryIndex = index;
    }
  }

  for (let index = boundaryIndex + 1; index <= anchorIndex; index += 1) {
    if (looksLikeQuestionStart(lines[index])) {
      return index;
    }
  }

  for (let index = boundaryIndex + 1; index < optionAIndex; index += 1) {
    if (lines[index]) {
      return index;
    }
  }

  return searchStart;
}

function parseOptions(lines) {
  const options = [];
  let currentOption = null;

  for (const line of lines) {
    const optionMatch = line.match(/^([A-Z])\.\s*(.*)$/);

    if (optionMatch) {
      if (currentOption) {
        options.push(currentOption);
      }

      currentOption = {
        id: optionMatch[1],
        lines: [optionMatch[2]],
      };
      continue;
    }

    if (currentOption) {
      currentOption.lines.push(line);
    }
  }

  if (currentOption) {
    options.push(currentOption);
  }

  return options.map((option) => ({
    id: option.id,
    text: joinInline(option.lines),
  }));
}

function parseAnswerIds(answerLine) {
  const answerText = answerLine.replace(/^Answer:\s*/i, '').toUpperCase();
  return [...new Set(answerText.match(/[A-Z]/g) ?? [])];
}

function getExpectedQuestionCount(lines) {
  const totalLine = lines.find((line) => /^Total:\s*\d+\s+Questions$/i.test(line));
  const totalMatch = totalLine?.match(/\d+/);
  return totalMatch ? Number(totalMatch[0]) : undefined;
}

function getFirstQuestionCursor(lines) {
  const totalIndex = lines.findIndex((line) => /^Total:\s*\d+\s+Questions$/i.test(line));
  const startSearchIndex = totalIndex >= 0 ? totalIndex + 1 : 0;
  const firstOptionAIndex = findNextIndex(lines, startSearchIndex, (line) => /^A\./.test(line));

  if (firstOptionAIndex < 0) {
    throw new Error('Could not find the first answer option in the PDF text.');
  }

  return findQuestionStart(lines, startSearchIndex, firstOptionAIndex);
}

function parseQuestions(lines) {
  const questions = [];
  let cursor = getFirstQuestionCursor(lines);

  while (cursor >= 0 && cursor < lines.length) {
    const answerIndex = findNextIndex(lines, cursor, isAnswerLine);

    if (answerIndex < 0) {
      break;
    }

    const optionAIndex = findNextIndex(
      lines,
      cursor,
      (line, index) => /^A\./.test(line) && index <= answerIndex,
    );

    if (optionAIndex < 0 || optionAIndex > answerIndex) {
      throw new Error(`Could not find option A before answer near line ${answerIndex + 1}.`);
    }

    const questionStart = findQuestionStart(lines, cursor, optionAIndex);
    const question = joinInline(lines.slice(questionStart, optionAIndex));
    const options = parseOptions(lines.slice(optionAIndex, answerIndex));
    const correctOptionIds = parseAnswerIds(lines[answerIndex]);

    const explanationStart =
      /^Explanation:$/i.test(lines[answerIndex + 1] ?? '') ? answerIndex + 2 : answerIndex + 1;
    const nextAnswerIndex = findNextIndex(lines, explanationStart, isAnswerLine);
    let nextQuestionStart = lines.length;

    if (nextAnswerIndex >= 0) {
      const nextOptionAIndex = findNextIndex(
        lines,
        explanationStart,
        (line, index) => /^A\./.test(line) && index <= nextAnswerIndex,
      );

      if (nextOptionAIndex >= 0 && nextOptionAIndex < nextAnswerIndex) {
        nextQuestionStart = findQuestionStart(lines, explanationStart, nextOptionAIndex);
      } else {
        const contextStart = Math.max(explanationStart, nextAnswerIndex - 15);
        const contextEnd = Math.min(lines.length, nextAnswerIndex + 5);
        const context = lines
          .slice(contextStart, contextEnd)
          .map((line, index) => `${contextStart + index + 1}: ${line}`)
          .join('\n');
        throw new Error(
          `Could not find next option A before answer near line ${nextAnswerIndex + 1}.\n${context}`,
        );
      }
    }

    const explanation = joinExplanation(lines.slice(explanationStart, nextQuestionStart));

    questions.push({
      id: `q${String(questions.length + 1).padStart(3, '0')}`,
      question,
      options,
      correctOptionIds,
      explanation,
    });

    cursor = nextAnswerIndex >= 0 ? nextQuestionStart : lines.length;
  }

  return questions;
}

function validateQuestions(questions, expectedQuestionCount) {
  const errors = [];

  if (expectedQuestionCount && questions.length !== expectedQuestionCount) {
    errors.push(`Expected ${expectedQuestionCount} questions, extracted ${questions.length}.`);
  }

  for (const question of questions) {
    const optionIds = new Set(question.options.map((option) => option.id));

    if (!question.question) {
      errors.push(`${question.id}: missing question text.`);
    }

    if (question.question && !/^[A-Z0-9]/.test(question.question)) {
      errors.push(`${question.id}: question appears to start mid-sentence: ${question.question.slice(0, 120)}`);
    }

    if (question.options.length < 2) {
      errors.push(`${question.id}: expected at least 2 options.`);
    }

    if (!question.correctOptionIds.length) {
      errors.push(`${question.id}: missing correct answer.`);
    }

    for (const answerId of question.correctOptionIds) {
      if (!optionIds.has(answerId)) {
        errors.push(`${question.id}: answer ${answerId} does not match an option.`);
      }
    }

    if (!question.explanation) {
      errors.push(`${question.id}: missing explanation. Question starts: ${question.question.slice(0, 120)}`);
    }

    if (/CertyIQ|--\s*\d+\s+of\s+\d+\s*--/i.test(JSON.stringify(question))) {
      errors.push(
        `${question.id}: still contains PDF footer/header noise. Question starts: ${question.question.slice(
          0,
          120,
        )}`,
      );
    }
  }

  if (errors.length > 0) {
    throw new Error(`Import validation failed:\n${errors.slice(0, 25).join('\n')}`);
  }
}

async function extractPdfText(sourcePath) {
  const buffer = await readFile(sourcePath);
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText({ pageJoiner: '\n\n' });
    return result.text;
  } finally {
    await parser.destroy();
  }
}

async function main() {
  const text = await extractPdfText(pdfPath);
  const lines = cleanExtractedLines(text);
  const expectedQuestionCount = getExpectedQuestionCount(lines);
  const questions = parseQuestions(lines);

  validateQuestions(questions, expectedQuestionCount);

  const json = `${JSON.stringify(questions, null, 2)}\n`;

  if (!dryRun) {
    await writeFile(outputPath, json, 'utf8');
  }

  const mode = dryRun ? 'Validated' : 'Imported';
  console.log(`${mode} ${questions.length} questions from ${path.relative(projectRoot, pdfPath)}.`);
  console.log(`${dryRun ? 'Output target' : 'Wrote'}: ${path.relative(projectRoot, outputPath)}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
