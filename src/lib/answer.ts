import type { AskResponse, CookingState, Recipe, RecipeChunk } from "./recipe-types";
import { classifyIntent } from "./intent";
import { searchChunks } from "./retrieval";

function speakable(text: string): string {
  const out = text
    .replace(/\b1\/2\b/g, "half a")
    .replace(/\b1\/4\b/g, "a quarter of a")
    .replace(/\b1\/3\b/g, "a third of a")
    .replace(/\b(\d+)\s*g\b/g, "$1 grams of")
    .replace(/\btbsp\b/g, "tablespoon of")
    .replace(/\btsp\b/g, "teaspoon of")
    .replace(/\bcup\b/g, "cup of")
    .replace(/^1 /, "One ")
    .replace(/\s+of\s+of\s+/g, " of ");
  return out.charAt(0).toUpperCase() + out.slice(1);
}


/** Deterministic offline sous-chef used in DEMO_MODE and as the Gemini fallback. */
export function answerLocally(
  question: string,
  recipe: Recipe,
  chunks: RecipeChunk[],
  state: CookingState,
): AskResponse {
  const intent = classifyIntent(question);
  const step = Math.min(Math.max(state.currentStep, 1), recipe.steps.length);
  const stepText = (n: number) => recipe.steps[n - 1] ?? "";

  if (intent === "STOP") {
    return { answer: "Okay, I'll wait. Say “Hey Chef, continue” when you're ready.", source: "demo" };
  }
  if (intent === "NEXT") {
    if (step >= recipe.steps.length) {
      return { answer: "That was the last step. Your dish is ready — enjoy!", advanceStep: false, source: "demo" };
    }
    return { answer: stepText(step + 1), advanceStep: true, source: "demo" };
  }
  if (intent === "CONTINUE") {
    return { answer: `Where we left off: ${stepText(step)}`, source: "demo" };
  }
  if (intent === "REPEAT") {
    return { answer: `Step ${step} of ${recipe.steps.length}. ${stepText(step)}`, source: "demo" };
  }
  if (intent === "BACK") {
    const target = Math.max(1, step - 1);
    return { answer: `Going back. ${stepText(target)}`, gotoStep: target, source: "demo" };
  }
  if (intent === "INGREDIENTS") {
    return { answer: `You'll need: ${recipe.ingredients.map(speakable).join(", ")}.`, source: "demo" };
  }
  if (intent === "PREFERENCE") {
    return { answer: "Got it, I'll remember that for this recipe.", preference: question, source: "demo" };
  }

  const hits = searchChunks(chunks, question, 4);
  if (!hits.length) {
    return {
      answer: `I couldn't find that in this recipe. Right now you're on step ${step}: ${stepText(step)}`,
      source: "demo",
    };
  }

  const top = hits[0]!;
  if (top.contentType === "ingredient") {
    return { answer: `${speakable(top.text).replace(/,.*$/, "")}.`, source: "demo" };
  }
  if (top.contentType === "timing" || top.contentType === "tip" || top.contentType === "substitution") {
    return { answer: speakable(top.text), source: "demo" };
  }
  return { answer: speakable(top.text.replace(/^Step \d+:\s*/, "")), source: "demo" };
}
