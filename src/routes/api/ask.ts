import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { answerLocally } from "@/lib/answer";
import { classifyIntent } from "@/lib/intent";
import { searchChunks } from "@/lib/retrieval";
import type { RecipeChunk } from "@/lib/recipe-types";

const Body = z.object({
  question: z.string().min(1),
  recipe: z.object({
    title: z.string(),
    ingredients: z.array(z.string()),
    steps: z.array(z.string()),
    timings: z.array(z.string()),
    substitutions: z.array(z.string()),
    tips: z.array(z.string()),
    sourceUrl: z.string().default(""),
  }),
  chunks: z.array(
    z.object({
      sessionId: z.string(),
      recipeName: z.string(),
      sourceUrl: z.string(),
      contentType: z.enum(["ingredient", "step", "timing", "substitution", "tip"]),
      text: z.string(),
    }),
  ),
  state: z.object({
    sessionId: z.string(),
    recipeName: z.string(),
    currentStep: z.number(),
    totalSteps: z.number(),
    status: z.enum(["READY", "COOKING", "INTERRUPTED", "COMPLETED"]),
    sourceUrl: z.string(),
    preferences: z.array(z.string()),
  }),
});

export const Route = createFileRoute("/api/ask")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid request body." }, { status: 400 });
        }

        const { question, recipe, chunks, state } = body;
        const local = answerLocally(question, recipe, chunks, state);
        const intent = classifyIntent(question);

        // Navigation intents are handled deterministically — never sent to the model,
        // so the cooking step can never drift because of a question.
        if (intent !== "QUESTION") return Response.json(local);

        const { isDemoMode, askGemini } = await import("@/lib/ai.server");
        if (isDemoMode()) return Response.json(local);

        let context: RecipeChunk[] = [];
        try {
          const { qdrantEnabled, searchQdrant } = await import("@/lib/qdrant.server");
          context = qdrantEnabled()
            ? await searchQdrant(question, state.sessionId, 5)
            : searchChunks(chunks, question, 5);
        } catch {
          context = searchChunks(chunks, question, 5);
        }
        if (!context.length) context = searchChunks(chunks, question, 5);

        const prompt = [
          `Recipe: ${recipe.title}`,
          `Current step: ${state.currentStep} / ${state.totalSteps}`,
          `Current instruction: ${recipe.steps[state.currentStep - 1] ?? ""}`,
          state.preferences.length ? `User preferences: ${state.preferences.join("; ")}` : "",
          "",
          "Retrieved recipe context:",
          ...context.map((c) => `- (${c.contentType}) ${c.text}`),
          "",
          `User: "${question}"`,
          "",
          "Answer briefly and naturally, as if speaking aloud. Do not invent information.",
        ]
          .filter(Boolean)
          .join("\n");

        try {
          const answer = await askGemini(prompt);
          return Response.json({ answer: answer || local.answer, source: "gemini" });
        } catch {
          return Response.json(local);
        }
      },
    },
  },
});
