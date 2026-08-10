import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({ text: z.string().min(1).max(1200) });

/**
 * Rime TTS proxy. The API key never leaves the server.
 * Returns 204 when Rime isn't configured/available so the browser falls back
 * to SpeechSynthesis.
 */
export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["RIME_API_KEY"];
        const demo = process.env["DEMO_MODE"] !== "false";
        if (!key || demo) return new Response(null, { status: 204 });

        let text: string;
        try {
          text = Body.parse(await request.json()).text;
        } catch {
          return Response.json({ error: "Invalid request body." }, { status: 400 });
        }

        try {
          const res = await fetch("https://users.rime.ai/v1/rime-tts", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${key}`,
              "content-type": "application/json",
              Accept: "audio/mp3",
            },
            body: JSON.stringify({
              text,
              speaker: process.env["RIME_SPEAKER"] ?? "cove",
              modelId: process.env["RIME_MODEL"] ?? "mistv2",
              samplingRate: 22050,
              speedAlpha: 1.0,
            }),
          });
          if (!res.ok) return new Response(null, { status: 204 });
          const audio = await res.arrayBuffer();
          if (!audio.byteLength) return new Response(null, { status: 204 });
          return new Response(audio, {
            headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
          });
        } catch {
          return new Response(null, { status: 204 });
        }
      },
    },
  },
});
