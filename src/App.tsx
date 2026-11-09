import { useEffect, useMemo, useRef, useState } from 'react';
import questionsJson from './data/questions.json';
import type { Attempt, Question, QuestionOption, SavedExamState, SessionMode } from './types';

const defaultQuestions = questionsJson as Question[];
const SESSION_KEY = 'mock-exam.current-session';
const ATTEMPTS_KEY = 'mock-exam.attempts';
const QUESTION_BANK_KEY = 'mock-exam.question-bank.formatted-v2';
const EXAM_SETTINGS_KEY = 'mock-exam.exam-settings';
const AI_SETTINGS_KEY = 'mock-exam.ai-settings';
const DEFAULT_AI_MODEL = 'openai/gpt-4o-mini';

const DEFAULT_EXAM_SETTINGS = {
  shuffleQuestions: true,
  shuffleOptions: true,
};

type ExamSettings = {
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
};

type Screen =
  | 'home'
  | 'session'
  | 'review'
  | 'results'
  | 'bank'
  | 'question-form'
  | 'settings';

type QuestionFormState = {
  id?: string;
  question: string;
  optionTexts: string[];
  optionExplanations: string[];
  correctIndexes: number[];
  summary: string;
};

type AiSettings = {
  apiKey: string;
  model: string;
};

type AiReview = {
  recommendedOptionIds: string[];
  confidence: 'low' | 'medium' | 'high';
  optionExplanations: Record<string, string>;
  summary: string;
  notes: string;
};

type AiStatus = {
  loading: boolean;
  error: string | null;
};

type OfflineInstallStatus = 'checking' | 'ready' | 'missing' | 'needs-https';

function isStandaloneApp(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in window.navigator &&
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

function shuffle<T>(items: T[]): T[] {
  return [...items]
    .map((item) => ({ item, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ item }) => item);
}

function orderItems<T>(items: T[], shuffled: boolean): T[] {
  return shuffled ? shuffle(items) : [...items];
}

function sameAnswer(selectedIds: string[], correctIds: string[]): boolean {
  if (selectedIds.length !== correctIds.length) {
    return false;
  }

  const selected = [...selectedIds].sort();
  const correct = [...correctIds].sort();
  return selected.every((id, index) => id === correct[index]);
}

function displayLabel(index: number): string {
  return String.fromCharCode(65 + index);
}

function displayAnswer(optionIds: string[], optionOrder: string[]): string {
  if (!optionIds.length) {
    return 'No answer';
  }

  return optionIds
    .map((optionId) => optionOrder.indexOf(optionId))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)
    .map(displayLabel)
    .join(', ');
}

function scrollSessionToTop(anchor?: HTMLElement | null) {
  const scrollToTop = () => {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    anchor?.scrollIntoView({ block: 'start', behavior: 'auto' });
  };

  scrollToTop();
  requestAnimationFrame(scrollToTop);
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

function parseAiJson(content: string, optionIds: string[]): AiReview {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
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

function buildAiPrompt(question: Question): string {
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

async function askOpenRouter(question: Question, settings: AiSettings): Promise<AiReview> {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
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

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function createSession(
  mode: SessionMode,
  questions: Question[],
  examSettings: ExamSettings,
): SavedExamState {
  const questionOrder = orderItems(
    questions.map((question) => question.id),
    examSettings.shuffleQuestions,
  );
  const optionOrders = Object.fromEntries(
    questions.map((question) => [
      question.id,
      orderItems(
        question.options.map((option) => option.id),
        examSettings.shuffleOptions,
      ),
    ]),
  );

  return {
    mode,
    startedAt: new Date().toISOString(),
    questionOrder,
    optionOrders,
    currentIndex: 0,
    selections: {},
    submittedQuestionIds: [],
    flaggedQuestionIds: [],
  };
}

function createEmptyQuestionForm(): QuestionFormState {
  return {
    question: '',
    optionTexts: ['', '', '', ''],
    optionExplanations: ['', '', '', ''],
    correctIndexes: [],
    summary: '',
  };
}

function questionToForm(question: Question): QuestionFormState {
  return {
    id: question.id,
    question: question.question,
    optionTexts: question.options.map((option) => option.text),
    optionExplanations: question.options.map((option) => option.explanation ?? ''),
    correctIndexes: question.correctOptionIds
      .map((id) => question.options.findIndex((option) => option.id === id))
      .filter((index) => index >= 0),
    summary: question.summary ?? '',
  };
}

function formToQuestion(form: QuestionFormState, fallbackId: string): Question {
  const options = form.optionTexts.map<QuestionOption>((text, index) => ({
    id: displayLabel(index),
    text: text.trim(),
    explanation: form.optionExplanations[index]?.trim() ?? '',
  }));

  return {
    id: form.id ?? fallbackId,
    question: form.question.trim(),
    options,
    correctOptionIds: form.correctIndexes
      .filter((index) => index >= 0 && index < options.length)
      .sort((a, b) => a - b)
      .map((index) => options[index].id),
    summary: form.summary.trim(),
  };
}

function getQuestionWarnings(question: Question): string[] {
  return question.options
    .filter((option) => !option.explanation.trim())
    .map((option) => `Option ${option.id} has no explanation.`);
}

function validateQuestion(question: Question): string[] {
  const errors: string[] = [];
  const optionIds = new Set(question.options.map((option) => option.id));

  if (!question.question) {
    errors.push('Question text is required.');
  }

  if (question.options.length < 2) {
    errors.push('Add at least two answer options.');
  }

  if (question.options.some((option) => !option.text)) {
    errors.push('Answer options cannot be blank.');
  }

  if (!question.correctOptionIds.length) {
    errors.push('Select at least one correct answer.');
  }

  if (question.correctOptionIds.some((id) => !optionIds.has(id))) {
    errors.push('A correct answer points to an option that does not exist.');
  }

  return errors;
}

function normalizeImportedQuestion(item: unknown, index: number): Question {
  const candidate = item as Partial<Question> & { explanation?: string };
  const options = Array.isArray(candidate.options)
    ? candidate.options.map((option, optionIndex) => {
        const partialOption = option as Partial<QuestionOption> & { explanation?: string };
        return {
          id: String(partialOption.id || displayLabel(optionIndex)).toUpperCase(),
          text: String(partialOption.text || ''),
          explanation: String(partialOption.explanation || ''),
        };
      })
    : [];

  if (typeof candidate.explanation === 'string' && candidate.explanation.trim()) {
    const optionIds = options.map((option) => option.id);
    const correctOptionIds = Array.isArray(candidate.correctOptionIds)
      ? candidate.correctOptionIds.map((id) => String(id).toUpperCase())
      : [];
    const legacy = candidate.explanation.trim();
    const correctSet = new Set(correctOptionIds);

    for (const option of options) {
      if (!option.explanation.trim()) {
        option.explanation = correctSet.has(option.id)
          ? 'Correct answer for this question. See the summary for additional context.'
          : 'Not the best choice for this scenario.';
      }
    }

    if (options.length === 1 && optionIds.length === 1) {
      options[0].explanation = legacy.replace(/^[-*•]\s*(?:Option\s*)?[A-F]\s*[:.)–—-]\s*/i, '');
    }

    return {
      id: String(candidate.id || `q${String(index + 1).padStart(3, '0')}`),
      question: String(candidate.question || ''),
      options,
      correctOptionIds,
      summary: String(candidate.summary || legacy),
    };
  }

  return {
    id: String(candidate.id || `q${String(index + 1).padStart(3, '0')}`),
    question: String(candidate.question || ''),
    options,
    correctOptionIds: Array.isArray(candidate.correctOptionIds)
      ? candidate.correctOptionIds.map((id) => String(id).toUpperCase())
      : [],
    summary: String(candidate.summary || ''),
  };
}

function validateQuestionBank(value: unknown): Question[] {
  if (!Array.isArray(value)) {
    throw new Error('The imported file must be a JSON array of questions.');
  }

  const ids = new Set<string>();

  return value.map((item, index) => {
    const question = normalizeImportedQuestion(item, index);
    const errors = validateQuestion(question);

    if (ids.has(question.id)) {
      errors.push(`Duplicate question ID: ${question.id}.`);
    }

    ids.add(question.id);

    if (errors.length) {
      throw new Error(`Question ${index + 1} is invalid: ${errors.join(' ')}`);
    }

    return question;
  });
}

function createNextQuestionId(questions: Question[]): string {
  const maxNumber = questions.reduce((max, question) => {
    const match = question.id.match(/^q(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `q${String(maxNumber + 1).padStart(3, '0')}`;
}

function getScore(session: SavedExamState, allQuestions: Question[]) {
  const byId = new Map(allQuestions.map((question) => [question.id, question]));
  const results = session.questionOrder.map((questionId) => {
    const question = byId.get(questionId);
    const selectedOptionIds = session.selections[questionId] ?? [];
    const correctOptionIds = question?.correctOptionIds ?? [];

    return {
      questionId,
      optionOrder:
        session.optionOrders[questionId] ?? question?.options.map((option) => option.id) ?? [],
      selectedOptionIds,
      correctOptionIds,
      isCorrect: sameAnswer(selectedOptionIds, correctOptionIds),
    };
  });

  return {
    results,
    correctCount: results.filter((result) => result.isCorrect).length,
    wrongCount: results.filter((result) => !result.isCorrect).length,
  };
}

type OptionExplanationsPanelProps = {
  question: Question;
  optionOrder: string[];
};

function OptionExplanationsPanel({ question, optionOrder }: OptionExplanationsPanelProps) {
  const effectiveOptionOrder = optionOrder.length
    ? optionOrder
    : question.options.map((option) => option.id);
  const orderedOptions = effectiveOptionOrder
    .map((id) => question.options.find((option) => option.id === id))
    .filter((option): option is QuestionOption => Boolean(option));
  const correctSet = new Set(question.correctOptionIds);

  return (
    <div className="option-explanations-panel">
      <h3>Answer explanations</h3>
      <div className="option-explanations-list">
        {orderedOptions.map((option, index) => (
          <article
            key={option.id}
            className={[
              'option-explanation-card',
              correctSet.has(option.id) ? 'correct' : 'incorrect-option',
            ].join(' ')}
          >
            <div className="option-explanation-heading">
              <span className="option-id">{displayLabel(index)}</span>
              <strong>{correctSet.has(option.id) ? 'Correct' : 'Incorrect'}</strong>
            </div>
            <p className="option-explanation-text">{option.text}</p>
            <p className="explanation">{option.explanation}</p>
          </article>
        ))}
      </div>
      {question.summary.trim() && (
        <div className="question-summary">
          <h4>Summary</h4>
          <p className="explanation">{question.summary}</p>
        </div>
      )}
    </div>
  );
}

function normalizeQuestionBank(questions: Question[]): Question[] {
  return questions.map((question, index) => normalizeImportedQuestion(question, index));
}

function App() {
  const [questionBank, setQuestionBank] = useState<Question[]>(() =>
    normalizeQuestionBank(loadJson<Question[]>(QUESTION_BANK_KEY, defaultQuestions)),
  );
  const [questionForm, setQuestionForm] = useState<QuestionFormState>(() =>
    createEmptyQuestionForm(),
  );
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [formWarnings, setFormWarnings] = useState<string[]>([]);
  const [aiSettings, setAiSettings] = useState<AiSettings>(() =>
    loadJson<AiSettings>(AI_SETTINGS_KEY, { apiKey: '', model: DEFAULT_AI_MODEL }),
  );
  const [examSettings, setExamSettings] = useState<ExamSettings>(() =>
    loadJson<ExamSettings>(EXAM_SETTINGS_KEY, DEFAULT_EXAM_SETTINGS),
  );
  const [aiStatus, setAiStatus] = useState<AiStatus>({ loading: false, error: null });
  const [aiReview, setAiReview] = useState<AiReview | null>(null);
  const [settingsReturnScreen, setSettingsReturnScreen] = useState<Screen>('home');
  const questionById = useMemo(
    () => new Map(questionBank.map((question) => [question.id, question])),
    [questionBank],
  );
  const [session, setSession] = useState<SavedExamState | null>(() =>
    loadJson<SavedExamState | null>(SESSION_KEY, null),
  );
  const [attempts, setAttempts] = useState<Attempt[]>(() =>
    loadJson<Attempt[]>(ATTEMPTS_KEY, []),
  );
  const [screen, setScreen] = useState<Screen>(() => (session ? 'session' : 'home'));
  const [latestAttempt, setLatestAttempt] = useState<Attempt | null>(null);
  const [offlineInstallStatus, setOfflineInstallStatus] = useState<OfflineInstallStatus>('checking');
  const [offlineReadyNotice, setOfflineReadyNotice] = useState(false);

  useEffect(() => {
    if (!window.isSecureContext) {
      setOfflineInstallStatus('needs-https');
      return;
    }

    if (!('serviceWorker' in navigator)) {
      setOfflineInstallStatus('missing');
      return;
    }

    let active = true;

    const markReady = () => {
      if (active) {
        setOfflineInstallStatus('ready');
      }
    };

    const checkController = () => {
      if (navigator.serviceWorker.controller) {
        markReady();
      }
    };

    checkController();

    navigator.serviceWorker.ready.then(checkController).catch(() => {
      if (active) {
        setOfflineInstallStatus('missing');
      }
    });

    const missingTimer = window.setTimeout(() => {
      if (active && !navigator.serviceWorker.controller) {
        setOfflineInstallStatus('missing');
      }
    }, 8000);

    const onOfflineReady = () => {
      markReady();
      if (isStandaloneApp()) {
        setOfflineReadyNotice(true);
      }
    };

    window.addEventListener('mock-exam:offline-ready', onOfflineReady);
    navigator.serviceWorker.addEventListener('controllerchange', checkController);

    return () => {
      active = false;
      window.clearTimeout(missingTimer);
      window.removeEventListener('mock-exam:offline-ready', onOfflineReady);
      navigator.serviceWorker.removeEventListener('controllerchange', checkController);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem(QUESTION_BANK_KEY, JSON.stringify(questionBank));
  }, [questionBank]);

  useEffect(() => {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(aiSettings));
  }, [aiSettings]);

  useEffect(() => {
    localStorage.setItem(EXAM_SETTINGS_KEY, JSON.stringify(examSettings));
  }, [examSettings]);

  useEffect(() => {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  }, [session]);

  useEffect(() => {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(attempts));
  }, [attempts]);

  const currentQuestionId = session?.questionOrder[session.currentIndex];
  const currentQuestion = currentQuestionId ? questionById.get(currentQuestionId) : undefined;
  const selectedIds = currentQuestionId ? session?.selections[currentQuestionId] ?? [] : [];
  const submittedIds = new Set(session?.submittedQuestionIds ?? []);
  const flaggedIds = new Set(session?.flaggedQuestionIds ?? []);
  const submittedCount = session?.submittedQuestionIds.length ?? 0;
  const answeredCount = session
    ? session.questionOrder.filter((id) => (session.selections[id] ?? []).length > 0).length
    : 0;

  const startSession = (mode: SessionMode) => {
    if (!questionBank.length) {
      window.alert('Add at least one question before starting a session.');
      return;
    }

    if (session && !window.confirm('Start a new session and discard the current one?')) {
      return;
    }

    setSession(createSession(mode, questionBank, examSettings));
    setLatestAttempt(null);
    setScreen('session');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const endSession = () => {
    if (!session) {
      return;
    }

    const score = getScore(session, questionBank);
    const completedAt = new Date().toISOString();
    const attempt: Attempt = {
      id: `${Date.now()}`,
      mode: session.mode,
      startedAt: session.startedAt,
      completedAt,
      totalQuestions: session.questionOrder.length,
      correctCount: score.correctCount,
      wrongCount: score.wrongCount,
      results: score.results,
    };

    setAttempts((current) => [attempt, ...current].slice(0, 20));
    setLatestAttempt(attempt);
    setSession(null);
    setScreen('results');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const selectOption = (optionId: string) => {
    if (!session || !currentQuestion) {
      return;
    }

    if (session.mode === 'practice' && submittedIds.has(currentQuestion.id)) {
      return;
    }

    const isMultiAnswer = currentQuestion.correctOptionIds.length > 1;
    const current = session.selections[currentQuestion.id] ?? [];
    let nextSelection: string[];

    if (isMultiAnswer) {
      const alreadySelected = current.includes(optionId);
      if (alreadySelected) {
        nextSelection = current.filter((id) => id !== optionId);
      } else if (current.length >= currentQuestion.correctOptionIds.length) {
        nextSelection = current;
      } else {
        nextSelection = [...current, optionId];
      }
    } else {
      nextSelection = [optionId];
    }

    setSession({
      ...session,
      selections: {
        ...session.selections,
        [currentQuestion.id]: nextSelection,
      },
    });
  };

  const submitPracticeAnswer = () => {
    if (!session || !currentQuestion || selectedIds.length === 0) {
      return;
    }

    const nextSubmitted = submittedIds.has(currentQuestion.id)
      ? session.submittedQuestionIds
      : [...session.submittedQuestionIds, currentQuestion.id];

    setSession({
      ...session,
      submittedQuestionIds: nextSubmitted,
    });
  };

  const goToQuestion = (index: number) => {
    if (!session) {
      return;
    }

    setSession({ ...session, currentIndex: index });
    setScreen('session');
    requestAnimationFrame(() => scrollSessionToTop());
  };

  const moveQuestion = (direction: -1 | 1) => {
    if (!session) {
      return;
    }

    const nextIndex = Math.min(
      Math.max(session.currentIndex + direction, 0),
      session.questionOrder.length - 1,
    );
    goToQuestion(nextIndex);
  };

  const toggleFlag = () => {
    if (!session || !currentQuestion) {
      return;
    }

    const isFlagged = flaggedIds.has(currentQuestion.id);
    const flaggedQuestionIds = isFlagged
      ? session.flaggedQuestionIds.filter((id) => id !== currentQuestion.id)
      : [...session.flaggedQuestionIds, currentQuestion.id];

    setSession({ ...session, flaggedQuestionIds });
  };

  const clearHistory = () => {
    if (window.confirm('Clear saved attempt history?')) {
      setAttempts([]);
    }
  };

  const resetCurrentSession = () => {
    if (window.confirm('Discard the current session?')) {
      setSession(null);
      setLatestAttempt(null);
      setScreen('home');
    }
  };

  const saveQuestionBank = (nextQuestions: Question[]) => {
    if (session) {
      setSession(null);
      setLatestAttempt(null);
    }

    setQuestionBank(nextQuestions);
  };

  const openNewQuestionForm = () => {
    setQuestionForm(createEmptyQuestionForm());
    setFormErrors([]);
    setFormWarnings([]);
    setAiReview(null);
    setAiStatus({ loading: false, error: null });
    setScreen('question-form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const openEditQuestionForm = (question: Question) => {
    setQuestionForm(questionToForm(question));
    setFormErrors([]);
    setFormWarnings([]);
    setAiReview(null);
    setAiStatus({ loading: false, error: null });
    setScreen('question-form');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const saveQuestion = (form: QuestionFormState) => {
    const nextQuestion = formToQuestion(form, form.id ?? createNextQuestionId(questionBank));
    const errors = validateQuestion(nextQuestion);
    const warnings = getQuestionWarnings(nextQuestion);

    if (errors.length) {
      setFormErrors(errors);
      setFormWarnings(warnings);
      return;
    }

    setFormErrors([]);
    setFormWarnings(warnings);

    const nextQuestions = form.id
      ? questionBank.map((question) => (question.id === form.id ? nextQuestion : question))
      : [...questionBank, nextQuestion];

    saveQuestionBank(nextQuestions);
    setScreen('bank');
  };

  const duplicateQuestion = (question: Question) => {
    const nextQuestion = {
      ...question,
      id: createNextQuestionId(questionBank),
      question: `${question.question} (copy)`,
    };

    saveQuestionBank([...questionBank, nextQuestion]);
  };

  const deleteQuestion = (questionId: string) => {
    if (!window.confirm('Delete this question?')) {
      return;
    }

    saveQuestionBank(questionBank.filter((question) => question.id !== questionId));
    if (questionForm.id === questionId) {
      setScreen('bank');
    }
  };

  const resetQuestionBank = () => {
    if (!window.confirm('Reset the editable question bank to the original questions.json?')) {
      return;
    }

    localStorage.removeItem(QUESTION_BANK_KEY);
    saveQuestionBank(defaultQuestions);
  };

  const exportQuestionBank = () => {
    const blob = new Blob([`${JSON.stringify(questionBank, null, 2)}\n`], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'questions.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const importQuestionBank = async (file: File) => {
    try {
      const text = await file.text();
      const imported = validateQuestionBank(JSON.parse(text));
      saveQuestionBank(imported);
      window.alert(`Imported ${imported.length} questions.`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Could not import the selected file.');
    }
  };

  const askAiForCurrentQuestion = async () => {
    if (!aiSettings.apiKey.trim()) {
      setAiStatus({ loading: false, error: 'Add your OpenRouter API key in AI Settings first.' });
      setSettingsReturnScreen('question-form');
      setScreen('settings');
      return;
    }

    const candidateQuestion = formToQuestion(
      questionForm,
      questionForm.id ?? createNextQuestionId(questionBank),
    );
    const requiredErrors = validateQuestion(candidateQuestion);

    if (requiredErrors.length) {
      setFormErrors(requiredErrors);
      return;
    }

    setFormErrors([]);
    setAiStatus({ loading: true, error: null });
    setAiReview(null);

    try {
      const review = await askOpenRouter(candidateQuestion, aiSettings);
      setAiReview(review);
      setAiStatus({ loading: false, error: null });
    } catch (error) {
      setAiStatus({
        loading: false,
        error: error instanceof Error ? error.message : 'Ask AI failed.',
      });
    }
  };

  const applyAiReview = (mode: 'replace-all' | 'replace-explanation' | 'merge-explanation') => {
    if (!aiReview) {
      return;
    }

    const correctIndexes = aiReview.recommendedOptionIds
      .map((id) => questionForm.optionTexts.findIndex((_, index) => displayLabel(index) === id))
      .filter((index) => index >= 0);
    const mergedSummary = [
      questionForm.summary.trim(),
      aiReview.summary.trim() && `AI summary (${new Date().toLocaleString()}):\n${aiReview.summary.trim()}`,
    ]
      .filter(Boolean)
      .join('\n\n');
    const optionExplanations = questionForm.optionTexts.map((_, index) => {
      const optionId = displayLabel(index);
      const aiText = aiReview.optionExplanations[optionId]?.trim() ?? '';
      const currentText = questionForm.optionExplanations[index]?.trim() ?? '';

      if (mode === 'merge-explanation') {
        return [currentText, aiText && `AI (${new Date().toLocaleString()}): ${aiText}`]
          .filter(Boolean)
          .join('\n\n');
      }

      return aiText || currentText;
    });

    if (mode === 'replace-all') {
      setQuestionForm({
        ...questionForm,
        correctIndexes,
        optionExplanations,
        summary: aiReview.summary.trim(),
      });
    }

    if (mode === 'replace-explanation') {
      setQuestionForm({
        ...questionForm,
        optionExplanations,
        summary: aiReview.summary.trim(),
      });
    }

    if (mode === 'merge-explanation') {
      setQuestionForm({
        ...questionForm,
        optionExplanations,
        summary: mergedSummary,
      });
    }
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Personal mock exam platform</p>
          <h1>Mock Exam</h1>
          <p className="hero-copy">
            Practice shuffled multiple-choice questions, review before final submission, and
            keep correct/wrong results on this device.
          </p>
        </div>
        <div className="hero-stat">
          <strong>{questionBank.length}</strong>
          <span>questions loaded</span>
        </div>
      </header>

      {screen === 'home' && (
        <>
          {(offlineInstallStatus === 'needs-https' ||
            (isStandaloneApp() && offlineInstallStatus === 'missing')) && (
            <section className="panel notice-panel notice-panel-warning">
              <h2>Offline install not finished</h2>
              {offlineInstallStatus === 'needs-https' ? (
                <>
                  <p>
                    iPhone needs an <strong>https://</strong> address to cache this app for offline
                    use. A plain <code>http://</code> link cannot finish the install.
                  </p>
                  <p>
                    On Windows, run <code>npm run serve</code>, then open{' '}
                    <code>https://YOUR_WINDOWS_IP:4173</code> in Safari. Tap through the certificate
                    warning once, delete any old Home Screen icon, add the app again, and open it
                    once while connected.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    The offline cache is not active yet on this iPhone. That usually means the app
                    was added from the wrong address or before caching finished.
                  </p>
                  <p>
                    On Windows, run <code>npm run serve</code>, open{' '}
                    <code>https://YOUR_WINDOWS_IP:4173</code> in Safari, delete this Home Screen
                    icon, add the app again, then open it once while connected so caching can
                    finish.
                  </p>
                </>
              )}
            </section>
          )}

          {offlineInstallStatus === 'checking' && isStandaloneApp() && (
            <section className="panel notice-panel notice-panel-info">
              <h2>Preparing offline install</h2>
              <p>Setting up offline caching on this iPhone. This usually takes a few seconds.</p>
            </section>
          )}

          {offlineReadyNotice && (
            <section className="panel notice-panel notice-panel-success">
              <div>
                <h2>Ready for offline use</h2>
                <p>
                  The app is cached on this iPhone. You can close it or restart your phone and open
                  it again without home Wi-Fi.
                </p>
              </div>
              <button className="ghost-button" onClick={() => setOfflineReadyNotice(false)}>
                Dismiss
              </button>
            </section>
          )}

          {session && (
            <section className="panel resume-panel">
              <div>
                <h2>Continue current {session.mode} session?</h2>
                <p>
                  Question {session.currentIndex + 1} of {session.questionOrder.length}. You have
                  answered {answeredCount} questions.
                </p>
              </div>
              <button className="primary-button" onClick={() => setScreen('session')}>
                Continue
              </button>
            </section>
          )}

          <section className="mode-grid">
            <button className="mode-card" onClick={() => startSession('exam')}>
              <span>Exam mode</span>
              <strong>Answer all, review, then submit</strong>
              <small>Best for a real mock exam run.</small>
            </button>
            <button className="mode-card" onClick={() => startSession('practice')}>
              <span>Practice mode</span>
              <strong>Submit each question immediately</strong>
              <small>See the correct answer and explanation one by one.</small>
            </button>
            <button className="mode-card" onClick={() => setScreen('bank')}>
              <span>Question bank</span>
              <strong>Add, edit, delete, import, export</strong>
              <small>Changes are saved on this device and can be exported as questions.json.</small>
            </button>
            <button
              className="mode-card"
              onClick={() => {
                setSettingsReturnScreen('home');
                setScreen('settings');
              }}
            >
              <span>Settings</span>
              <strong>Shuffle, Ask AI, and session options</strong>
              <small>Control question order, answer order, and OpenRouter configuration.</small>
            </button>
          </section>

          <History attempts={attempts} questions={questionBank} onClear={clearHistory} />
        </>
      )}

      {screen === 'session' && session && currentQuestion && (
        <QuestionView
          question={currentQuestion}
          session={session}
          selectedIds={selectedIds}
          optionOrder={session.optionOrders[currentQuestion.id] ?? []}
          isSubmitted={submittedIds.has(currentQuestion.id)}
          isFlagged={flaggedIds.has(currentQuestion.id)}
          answeredCount={answeredCount}
          submittedCount={submittedCount}
          onSelect={selectOption}
          onNext={() => moveQuestion(1)}
          onPrevious={() => moveQuestion(-1)}
          onToggleFlag={toggleFlag}
          onReview={() => setScreen('review')}
          onSubmitPractice={submitPracticeAnswer}
          onFinishPractice={endSession}
          onDiscard={resetCurrentSession}
        />
      )}

      {screen === 'review' && session && (
        <ReviewView
          session={session}
          questions={questionBank}
          answeredCount={answeredCount}
          onGoToQuestion={goToQuestion}
          onBack={() => setScreen('session')}
          onSubmit={endSession}
        />
      )}

      {screen === 'results' && latestAttempt && (
        <ResultsView
          attempt={latestAttempt}
          questions={questionBank}
          onHome={() => setScreen('home')}
          onNewExam={() => startSession('exam')}
          onNewPractice={() => startSession('practice')}
        />
      )}

      {screen === 'bank' && (
        <QuestionBankView
          questions={questionBank}
          defaultCount={defaultQuestions.length}
          onBack={() => setScreen('home')}
          onAdd={openNewQuestionForm}
          onEdit={openEditQuestionForm}
          onDuplicate={duplicateQuestion}
          onDelete={deleteQuestion}
          onImport={importQuestionBank}
          onExport={exportQuestionBank}
          onReset={resetQuestionBank}
        />
      )}

      {screen === 'question-form' && (
        <QuestionFormView
          form={questionForm}
          errors={formErrors}
          warnings={formWarnings}
          aiSettings={aiSettings}
          aiStatus={aiStatus}
          aiReview={aiReview}
          onChange={setQuestionForm}
          onCancel={() => setScreen('bank')}
          onSave={saveQuestion}
          onDelete={questionForm.id ? deleteQuestion : undefined}
          onAskAi={askAiForCurrentQuestion}
          onApplyAiReview={applyAiReview}
          onDismissAiReview={() => setAiReview(null)}
          onOpenAiSettings={() => {
            setSettingsReturnScreen('question-form');
            setScreen('settings');
          }}
        />
      )}

      {screen === 'settings' && (
        <SettingsView
          examSettings={examSettings}
          aiSettings={aiSettings}
          onExamSettingsChange={setExamSettings}
          onAiSettingsChange={setAiSettings}
          onBack={() => setScreen(settingsReturnScreen)}
        />
      )}
    </main>
  );
}

type QuestionViewProps = {
  question: Question;
  session: SavedExamState;
  selectedIds: string[];
  optionOrder: string[];
  isSubmitted: boolean;
  isFlagged: boolean;
  answeredCount: number;
  submittedCount: number;
  onSelect: (optionId: string) => void;
  onNext: () => void;
  onPrevious: () => void;
  onToggleFlag: () => void;
  onReview: () => void;
  onSubmitPractice: () => void;
  onFinishPractice: () => void;
  onDiscard: () => void;
};

type QuestionBankViewProps = {
  questions: Question[];
  defaultCount: number;
  onBack: () => void;
  onAdd: () => void;
  onEdit: (question: Question) => void;
  onDuplicate: (question: Question) => void;
  onDelete: (questionId: string) => void;
  onImport: (file: File) => Promise<void>;
  onExport: () => void;
  onReset: () => void;
};

function QuestionBankView({
  questions,
  defaultCount,
  onBack,
  onAdd,
  onEdit,
  onDuplicate,
  onDelete,
  onImport,
  onExport,
  onReset,
}: QuestionBankViewProps) {
  const [search, setSearch] = useState('');
  const searchText = search.trim().toLowerCase();
  const filteredQuestions = searchText
    ? questions.filter((question) =>
        [
          question.id,
          question.question,
          question.summary,
          ...question.options.flatMap((option) => [option.text, option.explanation]),
        ]
          .join(' ')
          .toLowerCase()
          .includes(searchText),
      )
    : questions;
  const singleAnswerCount = questions.filter((question) => question.correctOptionIds.length === 1).length;
  const multiAnswerCount = questions.length - singleAnswerCount;

  return (
    <section className="panel">
      <div className="session-bar">
        <div>
          <p className="eyebrow">Question bank</p>
          <h2>Edit your questions</h2>
        </div>
        <button className="secondary-button" onClick={onBack}>
          Back to menu
        </button>
      </div>

      <div className="summary-grid bank-summary">
        <div>
          <strong>{questions.length}</strong>
          <span>questions</span>
        </div>
        <div>
          <strong>{singleAnswerCount}</strong>
          <span>single answer</span>
        </div>
        <div>
          <strong>{multiAnswerCount}</strong>
          <span>multi answer</span>
        </div>
      </div>

      <div className="bank-toolbar">
        <label className="search-field">
          <span>Search questions</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search question, option, or explanation"
          />
        </label>
        <div className="toolbar-actions">
          <button className="primary-button" onClick={onAdd}>
            Add question
          </button>
          <label className="secondary-button file-button">
            Import JSON
            <input
              type="file"
              accept="application/json,.json"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void onImport(file);
                  event.target.value = '';
                }
              }}
            />
          </label>
          <button className="secondary-button" onClick={onExport}>
            Export questions.json
          </button>
          <button className="ghost-button" onClick={onReset}>
            Reset to original ({defaultCount})
          </button>
        </div>
      </div>

      <div className="bank-list">
        {filteredQuestions.map((question, index) => (
          <article className="bank-card" key={question.id}>
            <div>
              <p className="eyebrow">
                Question {index + 1} of {filteredQuestions.length}
              </p>
              <h3>{question.question}</h3>
              <div className="question-meta">
                <span>{question.correctOptionIds.length === 1 ? 'Single answer' : `Choose ${question.correctOptionIds.length}`}</span>
                <span>{question.options.length} options</span>
              </div>
            </div>
            <div className="bank-card-actions">
              <button className="secondary-button" onClick={() => onEdit(question)}>
                Edit
              </button>
              <button className="secondary-button" onClick={() => onDuplicate(question)}>
                Duplicate
              </button>
              <button className="ghost-button danger-button" onClick={() => onDelete(question.id)}>
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>

      {!filteredQuestions.length && (
        <p className="empty-note">No questions match your search.</p>
      )}
    </section>
  );
}

type QuestionFormViewProps = {
  form: QuestionFormState;
  errors: string[];
  warnings: string[];
  aiSettings: AiSettings;
  aiStatus: AiStatus;
  aiReview: AiReview | null;
  onChange: (form: QuestionFormState) => void;
  onCancel: () => void;
  onSave: (form: QuestionFormState) => void;
  onDelete?: (questionId: string) => void;
  onAskAi: () => void;
  onApplyAiReview: (mode: 'replace-all' | 'replace-explanation' | 'merge-explanation') => void;
  onDismissAiReview: () => void;
  onOpenAiSettings: () => void;
};

function QuestionFormView({
  form,
  errors,
  warnings,
  aiSettings,
  aiStatus,
  aiReview,
  onChange,
  onCancel,
  onSave,
  onDelete,
  onAskAi,
  onApplyAiReview,
  onDismissAiReview,
  onOpenAiSettings,
}: QuestionFormViewProps) {
  const previewQuestion = useMemo(
    () => formToQuestion({ ...form, id: form.id ?? 'preview' }, 'preview'),
    [form],
  );
  const liveWarnings = useMemo(() => getQuestionWarnings(previewQuestion), [previewQuestion]);
  const displayWarnings = warnings.length ? warnings : liveWarnings;

  const updateOptionText = (index: number, text: string) => {
    const optionTexts = [...form.optionTexts];
    optionTexts[index] = text;
    onChange({ ...form, optionTexts });
  };

  const updateOptionExplanation = (index: number, explanation: string) => {
    const optionExplanations = [...form.optionExplanations];
    optionExplanations[index] = explanation;
    onChange({ ...form, optionExplanations });
  };

  const toggleCorrect = (index: number) => {
    const correctIndexes = form.correctIndexes.includes(index)
      ? form.correctIndexes.filter((currentIndex) => currentIndex !== index)
      : [...form.correctIndexes, index];
    onChange({ ...form, correctIndexes });
  };

  const addOption = () => {
    onChange({
      ...form,
      optionTexts: [...form.optionTexts, ''],
      optionExplanations: [...form.optionExplanations, ''],
    });
  };

  const removeOption = (index: number) => {
    if (form.optionTexts.length <= 2) {
      return;
    }

    const optionTexts = form.optionTexts.filter((_, currentIndex) => currentIndex !== index);
    const optionExplanations = form.optionExplanations.filter(
      (_, currentIndex) => currentIndex !== index,
    );
    const correctIndexes = form.correctIndexes
      .filter((currentIndex) => currentIndex !== index)
      .map((currentIndex) => (currentIndex > index ? currentIndex - 1 : currentIndex));
    onChange({ ...form, optionTexts, optionExplanations, correctIndexes });
  };

  return (
    <section className="panel">
      <div className="session-bar">
        <div>
          <p className="eyebrow">{form.id ? 'Edit question' : 'Add question'}</p>
          <h2>{form.id ? 'Update question' : 'Create a new question'}</h2>
        </div>
        <button className="secondary-button" onClick={onCancel}>
          Back to bank
        </button>
      </div>

      {errors.length > 0 && (
        <div className="form-errors">
          <strong>Please fix these items:</strong>
          <ul>
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}

      {displayWarnings.length > 0 && (
        <div className="form-warnings">
          <strong>Warnings:</strong>
          <ul>
            {displayWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="question-form">
        <label className="form-field">
          <span>Question</span>
          <textarea
            value={form.question}
            rows={7}
            onChange={(event) => onChange({ ...form, question: event.target.value })}
            placeholder="Paste or type the question text"
          />
        </label>

        <div className="form-section-heading">
          <div>
            <h3>Answer options and explanations</h3>
            <p>
              Each option has its own explanation. Explanations stay attached to the option even
              when answers are shuffled during a session.
            </p>
          </div>
          <button className="secondary-button" onClick={addOption}>
            Add option
          </button>
        </div>

        <div className="editable-options">
          {form.optionTexts.map((text, index) => (
            <div className="editable-option" key={`${displayLabel(index)}-${index}`}>
              <label className="correct-toggle">
                <input
                  type="checkbox"
                  checked={form.correctIndexes.includes(index)}
                  onChange={() => toggleCorrect(index)}
                />
                Correct
              </label>
              <div className="editable-option-fields">
                <label className="form-field">
                  <span>Option {displayLabel(index)} text</span>
                  <textarea
                    value={text}
                    rows={3}
                    onChange={(event) => updateOptionText(index, event.target.value)}
                    placeholder={`Option ${displayLabel(index)} text`}
                  />
                </label>
                <label className="form-field">
                  <span>
                    Option {displayLabel(index)} explanation
                    {form.correctIndexes.includes(index) ? ' (why correct)' : ' (why incorrect)'}
                  </span>
                  <textarea
                    value={form.optionExplanations[index] ?? ''}
                    rows={4}
                    onChange={(event) => updateOptionExplanation(index, event.target.value)}
                    placeholder={
                      form.correctIndexes.includes(index)
                        ? 'Explain why this option is correct.'
                        : 'Explain why this option is not correct or is weaker.'
                    }
                  />
                </label>
              </div>
              <button
                className="ghost-button danger-button"
                onClick={() => removeOption(index)}
                disabled={form.optionTexts.length <= 2}
              >
                Remove
              </button>
            </div>
          ))}
        </div>

        <label className="form-field">
          <span>Overall summary (optional)</span>
          <textarea
            value={form.summary}
            rows={5}
            onChange={(event) => onChange({ ...form, summary: event.target.value })}
            placeholder="Optional conclusion, multi-answer combination note, or references."
          />
        </label>

        <section className="ai-panel">
          <div className="form-section-heading">
            <div>
              <h3>Ask AI</h3>
              <p>
                Send this question to OpenRouter for an AWS AIP-C01 focused answer review with
                per-option explanations.
              </p>
            </div>
            <button className="secondary-button" onClick={onOpenAiSettings}>
              AI settings
            </button>
          </div>

          <p className="ai-meta">
            Model: <strong>{aiSettings.model || DEFAULT_AI_MODEL}</strong>
            {aiSettings.apiKey ? ' · API key saved locally' : ' · API key not set'}
          </p>

          {aiStatus.error && <div className="form-errors">{aiStatus.error}</div>}

          <button className="primary-button" onClick={onAskAi} disabled={aiStatus.loading}>
            {aiStatus.loading ? 'Asking AI...' : 'Ask AI'}
          </button>

          {aiReview && (
            <article className="ai-review-card">
              <div className="result-heading">
                <div>
                  <p className="eyebrow">AI recommendation</p>
                  <h3>{aiReview.recommendedOptionIds.join(', ')}</h3>
                </div>
                <strong>Confidence: {aiReview.confidence}</strong>
              </div>
              {aiReview.notes && <p>{aiReview.notes}</p>}
              <div className="option-explanations-list">
                {form.optionTexts.map((_, index) => {
                  const optionId = displayLabel(index);
                  const explanation = aiReview.optionExplanations[optionId];
                  if (!explanation) {
                    return null;
                  }

                  return (
                    <article key={optionId} className="option-explanation-card">
                      <div className="option-explanation-heading">
                        <span className="option-id">{optionId}</span>
                        <strong>AI explanation</strong>
                      </div>
                      <p className="explanation">{explanation}</p>
                    </article>
                  );
                })}
              </div>
              {aiReview.summary.trim() && (
                <div className="question-summary">
                  <h4>AI summary</h4>
                  <p className="explanation">{aiReview.summary}</p>
                </div>
              )}
              <div className="result-actions">
                <button className="primary-button" onClick={() => onApplyAiReview('replace-all')}>
                  Replace answer + explanations
                </button>
                <button
                  className="secondary-button"
                  onClick={() => onApplyAiReview('replace-explanation')}
                >
                  Replace explanations only
                </button>
                <button
                  className="secondary-button"
                  onClick={() => onApplyAiReview('merge-explanation')}
                >
                  Merge explanations
                </button>
                <button className="ghost-button" onClick={onDismissAiReview}>
                  Dismiss
                </button>
              </div>
            </article>
          )}
        </section>
      </div>

      <div className="sticky-actions">
        {form.id && onDelete && (
          <button className="ghost-button danger-button" onClick={() => onDelete(form.id!)}>
            Delete question
          </button>
        )}
        <button className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
        <button className="primary-button" onClick={() => onSave(form)}>
          Save question
        </button>
      </div>
    </section>
  );
}

type SettingsViewProps = {
  examSettings: ExamSettings;
  aiSettings: AiSettings;
  onExamSettingsChange: (settings: ExamSettings) => void;
  onAiSettingsChange: (settings: AiSettings) => void;
  onBack: () => void;
};

function SettingsView({
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

function QuestionView({
  question,
  session,
  selectedIds,
  optionOrder,
  isSubmitted,
  isFlagged,
  answeredCount,
  submittedCount,
  onSelect,
  onNext,
  onPrevious,
  onToggleFlag,
  onReview,
  onSubmitPractice,
  onFinishPractice,
  onDiscard,
}: QuestionViewProps) {
  const questionTopRef = useRef<HTMLElement>(null);
  const isMultiAnswer = question.correctOptionIds.length > 1;
  const effectiveOptionOrder = optionOrder.length
    ? optionOrder
    : question.options.map((option) => option.id);
  const orderedOptions = effectiveOptionOrder
    .map((id) => question.options.find((option) => option.id === id))
    .filter((option): option is Question['options'][number] => Boolean(option));
  const totalQuestions = session.questionOrder.length;
  const questionNumber = session.currentIndex + 1;
  const canGoBack = session.currentIndex > 0;
  const canGoNext = session.currentIndex < totalQuestions - 1;
  const isPracticeComplete = session.mode === 'practice' && submittedCount === totalQuestions;
  const isCorrect = sameAnswer(selectedIds, question.correctOptionIds);

  useEffect(() => {
    scrollSessionToTop(questionTopRef.current);
  }, [question.id, session.currentIndex]);

  return (
    <section ref={questionTopRef} className="panel question-panel">
      <div className="session-bar">
        <div>
          <p className="eyebrow">{session.mode === 'exam' ? 'Exam mode' : 'Practice mode'}</p>
          <h2>
            Question {questionNumber} of {totalQuestions}
          </h2>
        </div>
        <button className="ghost-button" onClick={onDiscard}>
          Discard
        </button>
      </div>

      <div className="progress-track" aria-label="Session progress">
        <span style={{ width: `${(questionNumber / totalQuestions) * 100}%` }} />
      </div>

      <div className="question-meta">
        <span>{isMultiAnswer ? `Choose ${question.correctOptionIds.length}` : 'Choose one'}</span>
        <span>{session.mode === 'exam' ? `${answeredCount} answered` : `${submittedCount} submitted`}</span>
        {isFlagged && <span className="flag-label">Flagged</span>}
      </div>

      <p className="question-text">{question.question}</p>

      <div className="options-list">
        {orderedOptions.map((option, index) => {
          const isSelected = selectedIds.includes(option.id);
          const inputType = isMultiAnswer ? 'checkbox' : 'radio';
          const shouldShowAnswer = session.mode === 'practice' && isSubmitted;
          const isCorrectOption = question.correctOptionIds.includes(option.id);
          const visibleLabel = displayLabel(index);

          return (
            <label
              key={option.id}
              className={[
                'option-card',
                isSelected ? 'selected' : '',
                shouldShowAnswer && isCorrectOption ? 'correct' : '',
                shouldShowAnswer && isSelected && !isCorrectOption ? 'incorrect' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <input
                type={inputType}
                name={question.id}
                checked={isSelected}
                onChange={() => onSelect(option.id)}
                disabled={shouldShowAnswer}
              />
              <span className="option-id">{visibleLabel}</span>
              <span>{option.text}</span>
            </label>
          );
        })}
      </div>

      {session.mode === 'practice' && isSubmitted && (
        <div className={isCorrect ? 'feedback correct-feedback' : 'feedback wrong-feedback'}>
          <h3>{isCorrect ? 'Correct' : 'Incorrect'}</h3>
          <p>
            Correct answer:{' '}
            <strong>{displayAnswer(question.correctOptionIds, effectiveOptionOrder)}</strong>
          </p>
          <OptionExplanationsPanel
            question={question}
            optionOrder={effectiveOptionOrder}
          />
        </div>
      )}

      <div className="sticky-actions">
        <button className="secondary-button" onClick={onPrevious} disabled={!canGoBack}>
          Previous
        </button>
        <button className="secondary-button" onClick={onToggleFlag}>
          {isFlagged ? 'Unflag' : 'Flag'}
        </button>

        {session.mode === 'exam' ? (
          <>
            <button className="secondary-button" onClick={onNext} disabled={!canGoNext}>
              Next
            </button>
            <button className="primary-button" onClick={onReview}>
              Review & submit
            </button>
          </>
        ) : (
          <>
            {!isSubmitted ? (
              <button
                className="primary-button"
                onClick={onSubmitPractice}
                disabled={selectedIds.length === 0}
              >
                Submit answer
              </button>
            ) : (
              <button className="secondary-button" onClick={onNext} disabled={!canGoNext}>
                Next
              </button>
            )}
            {isPracticeComplete && (
              <button className="primary-button" onClick={onFinishPractice}>
                Finish
              </button>
            )}
          </>
        )}
      </div>
    </section>
  );
}

type ReviewViewProps = {
  session: SavedExamState;
  questions: Question[];
  answeredCount: number;
  onGoToQuestion: (index: number) => void;
  onBack: () => void;
  onSubmit: () => void;
};

function ReviewView({
  session,
  questions,
  answeredCount,
  onGoToQuestion,
  onBack,
  onSubmit,
}: ReviewViewProps) {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const flaggedIds = new Set(session.flaggedQuestionIds);
  const unanswered = session.questionOrder.length - answeredCount;

  return (
    <section className="panel">
      <div className="session-bar">
        <div>
          <p className="eyebrow">Final review</p>
          <h2>Review before submission</h2>
        </div>
        <button className="secondary-button" onClick={onBack}>
          Back to exam
        </button>
      </div>

      <div className="summary-grid">
        <div>
          <strong>{answeredCount}</strong>
          <span>answered</span>
        </div>
        <div>
          <strong>{unanswered}</strong>
          <span>unanswered</span>
        </div>
        <div>
          <strong>{session.flaggedQuestionIds.length}</strong>
          <span>flagged</span>
        </div>
      </div>

      <div className="review-list">
        {session.questionOrder.map((questionId, index) => {
          const question = questionById.get(questionId);
          const selected = session.selections[questionId] ?? [];
          const status = selected.length > 0 ? 'Answered' : 'Unanswered';

          return (
            <button key={questionId} className="review-item" onClick={() => onGoToQuestion(index)}>
              <span>Question {index + 1}</span>
              <strong>{status}</strong>
              {flaggedIds.has(questionId) && <em>Flagged</em>}
              <small>{question?.question.slice(0, 130)}...</small>
            </button>
          );
        })}
      </div>

      <div className="sticky-actions">
        <button className="secondary-button" onClick={onBack}>
          Keep reviewing
        </button>
        <button className="primary-button" onClick={onSubmit}>
          Submit final answers
        </button>
      </div>
    </section>
  );
}

type ResultsViewProps = {
  attempt: Attempt;
  questions: Question[];
  onHome: () => void;
  onNewExam: () => void;
  onNewPractice: () => void;
};

function ResultsView({ attempt, questions, onHome, onNewExam, onNewPractice }: ResultsViewProps) {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const percentage = Math.round((attempt.correctCount / attempt.totalQuestions) * 100);

  return (
    <section className="panel">
      <div className="session-bar">
        <div>
          <p className="eyebrow">Results</p>
          <h2>{percentage}% score</h2>
        </div>
        <button className="secondary-button" onClick={onHome}>
          Home
        </button>
      </div>

      <div className="summary-grid">
        <div>
          <strong>{attempt.correctCount}</strong>
          <span>correct</span>
        </div>
        <div>
          <strong>{attempt.wrongCount}</strong>
          <span>wrong</span>
        </div>
        <div>
          <strong>{attempt.totalQuestions}</strong>
          <span>total</span>
        </div>
      </div>

      <div className="result-actions">
        <button className="primary-button" onClick={onNewExam}>
          New exam
        </button>
        <button className="secondary-button" onClick={onNewPractice}>
          New practice
        </button>
      </div>

      <div className="results-list">
        {attempt.results.map((result, index) => {
          const question = questionById.get(result.questionId);

          if (!question) {
            return null;
          }

          const optionOrder = result.optionOrder?.length
            ? result.optionOrder
            : question.options.map((option) => option.id);

          return (
            <article key={result.questionId} className="result-card">
              <div className="result-heading">
                <span>Question {index + 1}</span>
                <strong className={result.isCorrect ? 'result-correct' : 'result-wrong'}>
                  {result.isCorrect ? 'Correct' : 'Wrong'}
                </strong>
              </div>
              <p>{question.question}</p>
              <p>
                Your answer: <strong>{displayAnswer(result.selectedOptionIds, optionOrder)}</strong>
              </p>
              <p>
                Correct answer: <strong>{displayAnswer(result.correctOptionIds, optionOrder)}</strong>
              </p>
              <OptionExplanationsPanel question={question} optionOrder={optionOrder} />
            </article>
          );
        })}
      </div>
    </section>
  );
}

type HistoryProps = {
  attempts: Attempt[];
  questions: Question[];
  onClear: () => void;
};

function History({ attempts, questions, onClear }: HistoryProps) {
  const questionById = new Map(questions.map((question) => [question.id, question]));

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
          const percentage = Math.round((attempt.correctCount / attempt.totalQuestions) * 100);

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
                    return <li key={result.questionId}>{question?.question.slice(0, 160)}...</li>;
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

export default App;
