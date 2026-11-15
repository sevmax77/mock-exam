import type { Question } from '../types';
import { displayLabel } from './format';

export const DEFAULT_AI_MODEL = 'openai/gpt-4o-mini';
export const AI_REQUEST_TIMEOUT_MS = 90_000;

export type AiSettings = {
  apiKey: string;
  model: string;
};

export const DEFAULT_AI_SETTINGS: AiSettings = {
  apiKey: '',
  model: DEFAULT_AI_MODEL,
};

export type AiReview = {
  /** Option texts the review was made for; applying is refused if they changed since. */
  optionsSnapshot: string;
  recommendedOptionIds: string[];
  confidence: 'low' | 'medium' | 'high';
  optionExplanations: Record<string, string>;
  summary: string;
  notes: string;
};

export type AiReviewResult = Omit<AiReview, 'optionsSnapshot'>;

export type AiStatus = {
  loading: boolean;
  error: string | null;
};

export function stripCodeFence(content: string): string {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) {
    return fenced[1];
  }

  // Tolerate prose around the JSON object.
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  return start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed;
}

export function parseAiJson(content: string, optionIds: string[]): AiReviewResult {
  const cleaned = stripCodeFence(content);
  const parsed = JSON.parse(cleaned) as Partial<AiReview> & {
    explanation?: string;
    optionExplanations?: Record<string, string> | Array<{ id?: string; explanation?: string }>;
  };

  if (!Array.isArray(parsed.recommendedOptionIds)) {
    throw new Error('The AI response did not include the expected JSON fields.');
  }

  const optionExplanations: Record<string, string> = {};

  if (parsed.optionExplanations && !Array.isArray(parsed.optionExplanations)) {
    for (const optionId of optionIds) {
      const explanation = parsed.optionExplanations[optionId];
      if (typeof explanation === 'string') {
        optionExplanations[optionId] = explanation.trim();
      }
    }
  } else if (Array.isArray(parsed.optionExplanations)) {
    for (const entry of parsed.optionExplanations) {
      const optionId = String(entry.id ?? '').trim().toUpperCase();
      if (optionIds.includes(optionId) && typeof entry.explanation === 'string') {
        optionExplanations[optionId] = entry.explanation.trim();
      }
    }
  }

  if (!Object.keys(optionExplanations).length && typeof parsed.explanation === 'string') {
    for (const optionId of optionIds) {
      optionExplanations[optionId] = parsed.explanation.trim();
    }
  }

  if (!Object.keys(optionExplanations).length) {
    throw new Error('The AI response did not include per-option explanations.');
  }

  return {
    recommendedOptionIds: parsed.recommendedOptionIds.map((id) => String(id).trim().toUpperCase()),
    confidence:
      parsed.confidence === 'low' || parsed.confidence === 'medium' || parsed.confidence === 'high'
        ? parsed.confidence
        : 'medium',
    optionExplanations,
    summary: String(parsed.summary ?? ''),
    notes: String(parsed.notes ?? ''),
  };
}

export function buildAiPrompt(question: Question): string {
  const options = question.options
    .map((option) => `${option.id}. ${option.text}`)
    .join('\n');
  const existingExplanations = question.options
    .map((option) => `${option.id}: ${option.explanation || '(empty)'}`)
    .join('\n');

  return `Review this AWS Certified Generative AI Developer - Professional AIP-C01 style multiple-choice question.

Task:
1. Determine the best correct answer option ID or IDs.
2. Write a separate explanation for every answer option.
3. For correct options, explain why that option is correct.
4. For incorrect options, explain why that option is weaker or incorrect.
5. Add an optional overall summary for multi-answer combinations, conclusions, or references.
6. If the existing answer appears wrong, say so in notes.

Return only valid JSON with this exact shape:
{
  "recommendedOptionIds": ["A"],
  "confidence": "low" | "medium" | "high",
  "optionExplanations": {
    "A": "Why option A is or is not correct.",
    "B": "Why option B is or is not correct."
  },
  "summary": "Optional overall conclusion for multi-answer questions or references.",
  "notes": "Short note comparing your recommendation with the existing answer."
}

Rules:
- optionExplanations must include every option ID shown below.
- Do not rely on shuffled display positions. Use the canonical option IDs only.
- Keep each option explanation focused on that one option.

Question:
${question.question}

Answer options:
${options}

Existing correct answer ID(s): ${question.correctOptionIds.join(', ')}

Existing per-option explanations:
${existingExplanations}

Existing summary:
${question.summary || '(empty)'}`;
}

/**
 * Relabels options A, B, C... by their position in the form so the AI, the review card and
 * applyAiReviewToForm all agree on labels, even when stored option ids are not positional.
 */
export function toPositionalQuestion(question: Question): Question {
  const labelById = new Map(
    question.options.map((option, index) => [option.id, displayLabel(index)]),
  );

  return {
    ...question,
    options: question.options.map((option, index) => ({ ...option, id: displayLabel(index) })),
    correctOptionIds: question.correctOptionIds
      .map((id) => labelById.get(id))
      .filter((id): id is string => Boolean(id)),
  };
}

export async function askOpenRouter(
  question: Question,
  settings: AiSettings,
  signal: AbortSignal,
): Promise<AiReviewResult> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    signal,
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Mock Exam',
    },
    body: JSON.stringify({
      model: settings.model.trim() || DEFAULT_AI_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert AWS certification reviewer for AWS Certified Generative AI Developer - Professional AIP-C01. Be precise, skeptical, and exam-focused. Prefer AWS managed-service best practices, least operational overhead, and exact scenario requirements. Do not invent unsupported AWS features. Return only valid JSON.',
        },
        {
          role: 'user',
          content: buildAiPrompt(question),
        },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `OpenRouter request failed with status ${response.status}.`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('OpenRouter returned an empty response.');
  }

  const review = parseAiJson(
    content,
    question.options.map((option) => option.id),
  );
  const validOptionIds = new Set(question.options.map((option) => option.id));

  if (!review.recommendedOptionIds.length) {
    throw new Error('AI did not recommend any answer option.');
  }

  for (const optionId of review.recommendedOptionIds) {
    if (!validOptionIds.has(optionId)) {
      throw new Error(`AI recommended option ${optionId}, but that option does not exist.`);
    }
  }

  return review;
}
