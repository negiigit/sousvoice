import type { Recipe, RecipeChunk } from "./recipe-types";

/** Turn a structured recipe into retrievable chunks (the same shape stored in Qdrant). */
export function chunkRecipe(recipe: Recipe, sessionId: string): RecipeChunk[] {
  const base = {
    sessionId,
    recipeName: recipe.title,
    sourceUrl: recipe.sourceUrl ?? "",
  };
  return [
    ...recipe.ingredients.map((text) => ({ ...base, contentType: "ingredient" as const, text })),
    ...recipe.steps.map((text, i) => ({
      ...base,
      contentType: "step" as const,
      text: `Step ${i + 1}: ${text}`,
    })),
    ...recipe.timings.map((text) => ({ ...base, contentType: "timing" as const, text })),
    ...recipe.substitutions.map((text) => ({ ...base, contentType: "substitution" as const, text })),
    ...recipe.tips.map((text) => ({ ...base, contentType: "tip" as const, text })),
  ];
}

const STOP = new Set([
  "the","a","an","how","much","many","is","do","i","should","of","to","in","for","it","this","that",
  "can","use","what","and","with","my","me","we","did","was","are","you","at","on","need","there","be",
]);

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/** Lightweight lexical retrieval — stands in for Qdrant semantic search in DEMO_MODE. */
export function searchChunks(chunks: RecipeChunk[], query: string, topK = 5): RecipeChunk[] {
  const q = tokens(query);
  if (!q.length) return chunks.slice(0, topK);
  const scored = chunks.map((c) => {
    const t = tokens(c.text);
    let score = 0;
    for (const w of q) {
      if (t.includes(w)) score += 2;
      else if (t.some((x) => x.startsWith(w.slice(0, 4)) || w.startsWith(x.slice(0, 4)))) score += 0.7;
    }
    if (/how (long|much time)|minutes|time/i.test(query) && c.contentType === "timing") score += 1.5;
    if (/how much|how many/i.test(query) && c.contentType === "ingredient") score += 1;
    if (/instead|substitute|replace|can i use/i.test(query) && c.contentType === "substitution") score += 1.5;
    return { c, score };
  });
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((s) => s.c);
}
