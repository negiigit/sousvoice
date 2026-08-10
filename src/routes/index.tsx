import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ChefHat, Mic, Brain, Undo2, Loader2, Youtube } from "lucide-react";
import { saveSession, type PreparedSession } from "@/lib/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SousVoice — Hands-Free AI Cooking Assistant" },
      {
        name: "description",
        content:
          'Turn any YouTube recipe into a hands-free cooking experience. Paste a video, put your device down, and say "Hey Chef".',
      },
      { property: "og:title", content: "SousVoice — Hands-Free AI Cooking Assistant" },
      {
        property: "og:description",
        content: 'Paste a recipe video. Put your device down. Say "Hey Chef." Cook hands-free.',
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const FEATURES = [
  {
    icon: Mic,
    emoji: "🎤",
    title: "Hands-free",
    body: 'Say "Hey Chef" and cook without touching your device.',
  },
  {
    icon: Brain,
    emoji: "🧠",
    title: "Context-aware",
    body: "SousVoice understands your recipe and current cooking step.",
  },
  {
    icon: Undo2,
    emoji: "↩️",
    title: "Interrupt & Resume",
    body: "Ask questions anytime without losing your place.",
  },
];

function Landing() {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState<"url" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function prepare(demo: boolean) {
    setError(null);
    if (!demo && !url.trim()) {
      setError("Paste a YouTube recipe URL first, or try the demo recipe.");
      return;
    }
    setLoading(demo ? "demo" : "url");
    try {
      const res = await fetch("/api/prepare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() || undefined, demo }),
      });
      const data = (await res.json()) as Partial<PreparedSession> & { error?: string };
      if (!res.ok || !data.recipe) {
        setError(data.error ?? "Something went wrong preparing that recipe. Please try again.");
        return;
      }
      const session: PreparedSession = {
        sessionId: data.sessionId!,
        recipe: data.recipe,
        chunks: data.chunks ?? [],
        demoMode: Boolean(data.demoMode),
        retrieval: data.retrieval ?? "local",
        state: {
          sessionId: data.sessionId!,
          recipeName: data.recipe.title,
          currentStep: 1,
          totalSteps: data.recipe.steps.length,
          status: "READY",
          sourceUrl: data.recipe.sourceUrl,
          preferences: [],
        },
      };
      saveSession(session);
      navigate({ to: "/cook" });
    } catch {
      setError("We couldn't reach SousVoice. Check your connection and try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <main className="min-h-screen bg-background px-5 pb-20 pt-10 sm:pt-16">
      <div className="mx-auto max-w-3xl">
        <div className="flex items-center justify-center gap-2">
          <ChefHat className="h-7 w-7 text-primary" aria-hidden />
          <span className="font-display text-xl font-bold tracking-[0.22em]">SOUSVOICE</span>
        </div>

        <h1 className="mt-8 text-center font-display text-4xl font-bold leading-tight sm:text-5xl">
          Turn any YouTube recipe into a hands-free cooking experience.
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-center text-lg text-muted-foreground">
          Paste a recipe video. Put your device down. Say <strong className="text-foreground">“Hey Chef.”</strong>{" "}
          Let SousVoice guide you through every step.
        </p>

        <section className="surface-card mt-10 p-6 sm:p-8" aria-label="Prepare a recipe">
          <label htmlFor="yt" className="label-caps">
            Paste YouTube Recipe URL
          </label>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Youtube
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                id="yt"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && prepare(false)}
                placeholder="Paste your YouTube URL here"
                inputMode="url"
                className="h-14 w-full rounded-xl border border-input bg-background pl-11 pr-4 text-base outline-none transition focus:border-primary focus:ring-4 focus:ring-ring/25"
              />
            </div>
            <button
              onClick={() => prepare(false)}
              disabled={loading !== null}
              className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-primary px-6 font-display text-base font-bold text-primary-foreground shadow-[var(--shadow-lift)] transition hover:brightness-105 disabled:opacity-60"
            >
              {loading === "url" ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : null}
              Prepare My Recipe
            </button>
          </div>

          <button
            onClick={() => prepare(true)}
            disabled={loading !== null}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-bold text-secondary-foreground transition hover:brightness-105 disabled:opacity-60"
          >
            {loading === "demo" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Try the demo recipe — Paneer Tikka
          </button>

          {error ? (
            <p role="alert" className="mt-4 rounded-lg bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
              {error}
            </p>
          ) : null}
          <p className="mt-4 text-sm text-muted-foreground">
            Works best in Chrome. SousVoice uses the video&apos;s captions — pick a recipe video that has them.
          </p>
        </section>

        <section className="mt-8 grid gap-4 sm:grid-cols-3" aria-label="Features">
          {FEATURES.map((f) => (
            <article key={f.title} className="rounded-2xl bg-secondary/60 p-5">
              <div className="flex items-center gap-2">
                <span aria-hidden className="text-lg">
                  {f.emoji}
                </span>
                <h2 className="font-display text-lg font-bold">{f.title}</h2>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.body}</p>
            </article>
          ))}
        </section>

        <p className="mt-10 text-center text-sm text-muted-foreground">
          Your voice-powered AI sous-chef.
        </p>
      </div>
    </main>
  );
}
