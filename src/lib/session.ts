import type { CookingState, Recipe, RecipeChunk } from "./recipe-types";

export interface PreparedSession {
  sessionId: string;
  recipe: Recipe;
  chunks: RecipeChunk[];
  demoMode: boolean;
  retrieval: string;
  state: CookingState;
}

const KEY = "sousvoice.session";

export function saveSession(s: PreparedSession) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — session stays in memory only */
  }
}

export function loadSession(): PreparedSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PreparedSession) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
