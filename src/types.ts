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
};
