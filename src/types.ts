export type QuestionOption = {
  id: string;
  text: string;
  explanation: string;
};

export type Question = {
  id: string;
  question: string;
  options: QuestionOption[];
  correctOptionIds: string[];
  summary: string;
};

export type SessionMode = 'exam' | 'practice';

export type QuestionResult = {
  questionId: string;
  optionOrder?: string[];
  selectedOptionIds: string[];
  correctOptionIds: string[];
  isCorrect: boolean;
  /** True when the question was flagged when the session ended. */
  flagged?: boolean;
};

export type Attempt = {
  id: string;
  mode: SessionMode;
  startedAt: string;
  completedAt: string;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  results: QuestionResult[];
  /** True when an exam was submitted automatically because its time limit ran out. */
  timedOut?: boolean;
};

export type SavedExamState = {
  mode: SessionMode;
  startedAt: string;
  questionOrder: string[];
  optionOrders: Record<string, string[]>;
  currentIndex: number;
  selections: Record<string, string[]>;
  submittedQuestionIds: string[];
  flaggedQuestionIds: string[];
  /** ISO time when a timed exam is submitted automatically. Absent when untimed. */
  deadline?: string;
};
