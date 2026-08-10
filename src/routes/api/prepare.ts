import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PANEER_TIKKA } from "@/lib/demo-recipe";
import { chunkRecipe } from "@/lib/retrieval";
import type { Recipe } from "@/lib/recipe-types";

const Body = z.object({ url: z.string().optional(), demo: z.boolean().optional() });

export const Route = createFileRoute("/api/prepare")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: z.infer<typeof Body>;
        try {
          body = Body.parse(await request.json());
        } catch {
          return Response.json({ error: "Invalid request body." }, { status: 400 });
        }

        const { extractVideoId, fetchTranscript, extractRecipe, isDemoMode } = await import("@/lib/ai.server");
        const sessionId = crypto.randomUUID();
        const demo = body.demo || isDemoMode() || !body.url;

        if (demo) {
          const recipe: Recipe = { ...PANEER_TIKKA, sourceUrl: body.url || PANEER_TIKKA.sourceUrl };
          return Response.json({
            sessionId,
            recipe,
            chunks: chunkRecipe(recipe, sessionId),
            demoMode: true,
            retrieval: "local",
          });
        }

        const videoId = extractVideoId(body.url!);
        if (!videoId) {
          return Response.json(
            { error: "That doesn't look like a YouTube video link. Please paste a full YouTube URL." },
            { status: 400 },
          );
        }

        const transcript = await fetchTranscript(videoId);
        if (!transcript) {
          return Response.json(
            {
              error:
                "This video doesn't have an accessible transcript. Please choose a recipe video with captions.",
            },
            { status: 422 },
          );
        }

        let recipe: Recipe;
        try {
          recipe = await extractRecipe(transcript, body.url!);
        } catch {
          return Response.json(
            { error: "We couldn't understand this recipe right now. Try again, or run the demo recipe." },
            { status: 502 },
          );
        }
        if (!recipe.steps.length) {
          return Response.json(
            { error: "We couldn't find cooking steps in this video. Try another recipe video." },
            { status: 422 },
          );
        }

        const chunks = chunkRecipe(recipe, sessionId);
        let retrieval: "qdrant" | "local" = "local";
        try {
          const { qdrantEnabled, upsertChunks } = await import("@/lib/qdrant.server");
          if (qdrantEnabled()) {
            await upsertChunks(chunks);
            retrieval = "qdrant";
          }
        } catch {
          retrieval = "local";
        }

        return Response.json({ sessionId, recipe, chunks, demoMode: false, retrieval });
      },
    },
  },
});
