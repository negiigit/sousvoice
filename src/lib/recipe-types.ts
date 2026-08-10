export type ContentType = "ingredient" | "step" | "timing" | "substitution" | "tip";

export interface Recipe {
  title: string;
  ingredients: string[];
  steps: string[];
  timings: string[];
  substitutions: string[];
  tips: string[];
  sourceUrl?: string;
}

export interface RecipeChunk {
  sessionId: string;
  recipeName: string;
  sourceUrl: string;
  contentType: ContentType;
  text: string;
}

export type CookStatus = "READY" | "COOKING" | "INTERRUPTED" | "COMPLETED";

export interface CookingState {
  sessionId: string;
  recipeName: string;
  currentStep: number; // 1-indexed
  totalSteps: number;
  status: CookStatus;
  sourceUrl: string;
  preferences: string[];
}

export type VoiceState =
  | "READY"
  | "LISTENING_FOR_WAKE_WORD"
  | "LISTENING"
  | "THINKING"
  | "SPEAKING"
  | "INTERRUPTED";

export interface AskResponse {
  answer: string;
  advanceStep?: boolean;
  gotoStep?: number;
  preference?: string;
  source: "demo" | "gemini";
}
