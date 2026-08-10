import type { AskResponse, CookingState, Recipe, RecipeChunk } from "./recipe-types";
import { classifyIntent } from "./intent";
import { searchChunks } from "./retrieval";

function speakable(text: string): string {
  return text
    .replace(/\b1\/2\b/g, "half a")
    .replace(/\b1\/4\b/g, "a quarter")
    .replace(/\b1\/3\b/g, "a third")
    .replace(/\btbsp\b/g, "tablespoon")
    .replace(/\btsp\b/g, "teaspoon")
    .replace(/\bg\b/g, "grams")
    .replace(/^1 tablespoon/i, "One tablespoon")
    .replace(/^1 teaspoon/i, "One teaspoon");
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

  if (intent === "STOP") {
    return { answer: "Okay, I'll wait. Say “Hey Chef, continue” when you're ready.", source: "demo" };
  }
  if (intent === "NEXT") {
    if (step >= recipe.steps.length) {
      return { answer: "That was the last step. Your dish is ready — enjoy!", advanceStep: false, source: "demo" };
    }
    return { answer: recipe.steps[step], advanceStep: true, source: "demo" };
  }
  if (intent === "CONTINUE") {
    return { answer: `Where we left off: ${recipe.steps[step - 1]}`, source: "demo" };
  }
  if (intent === "REPEAT") {
    return { answer: `Step ${step} of ${recipe.steps.length}. ${recipe.steps[step - 1]}`, source: "demo" };
  }
  if (intent === "BACK") {
    const target = Math.max(1, step - 1);
    return { answer: `Going back. ${recipe.steps[target - 1]}`, gotoStep: target, source: "demo" };
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
      answer: `I couldn't find that in this recipe. Right now you're on step ${step}: ${recipe.steps[step - 1]}`,
      source: "demo",
    };
  }

  const top = hits[0];
  if (top.contentType === "ingredient") {
    return { answer: `${speakable(top.text).replace(/,.*$/, "")}.`, source: "demo" };
  }
  if (top.contentType === "timing" || top.contentType === "tip" || top.contentType === "substitution") {
    return { answer: speakable(top.text), source: "demo" };
  }
  return { answer: speakable(top.text.replace(/^Step \d+:\s*/, "")), source: "demo" };
}
