import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChefHat, Youtube, ArrowRight, RotateCcw, Play, Send, AlertTriangle } from "lucide-react";
import { VoiceOrb } from "@/components/VoiceOrb";
import { useSpeaker } from "@/hooks/useSpeaker";
import { useWakeWord } from "@/hooks/useWakeWord";
import { loadSession, saveSession, type PreparedSession } from "@/lib/session";
import type { AskResponse, VoiceState } from "@/lib/recipe-types";

export const Route = createFileRoute("/cook")({
  head: () => ({
    meta: [
      { title: "Cooking with SousVoice — Hands-Free Sous-Chef" },
      {
        name: "description",
        content:
          'Follow your recipe hands-free. SousVoice tracks your step, answers questions when you say "Hey Chef", and resumes right where you left off.',
      },
      { property: "og:title", content: "Cooking with SousVoice" },
      {
        property: "og:description",
        content: 'Hands-free cooking guidance. Say "Hey Chef" to ask anything without losing your place.',
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: CookPage,
  ssr: false,
});

interface Turn {
  who: "you" | "chef";
  text: string;
}

function CookPage() {
  const navigate = useNavigate();
  const [session, setSession] = useState<PreparedSession | null>(null);
  const [started, setStarted] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("READY");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [typed, setTyped] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const sessionRef = useRef<PreparedSession | null>(null);
  const busyRef = useRef(false);

  const { speak, stop, speaking } = useSpeaker();

  useEffect(() => {
    const s = loadSession();
    if (!s) {
      navigate({ to: "/" });
      return;
    }
    setSession(s);
    sessionRef.current = s;
  }, [navigate]);

  const persist = useCallback((next: PreparedSession) => {
    sessionRef.current = next;
    setSession(next);
    saveSession(next);
  }, []);

  const say = useCallback(
    async (text: string) => {
      setTurns((t) => [...t, { who: "chef", text }]);
      setVoiceState("SPEAKING");
      await speak(text);
    },
    [speak],
  );

  const handleQuestion = useCallback(
    async (question: string) => {
      const current = sessionRef.current;
      if (!current || busyRef.current || !question.trim()) return;
      busyRef.current = true;
      stop();
      setTurns((t) => [...t, { who: "you", text: question }]);
      setVoiceState("THINKING");

      try {
        const res = await fetch("/api/ask", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            question,
            recipe: current.recipe,
            chunks: current.chunks,
            state: current.state,
          }),
        });
        const data = (await res.json()) as AskResponse & { error?: string };
        if (!res.ok || !data.answer) {
          await say("I had trouble with that one. Could you ask again?");
          return;
        }

        // Cooking state changes only on explicit navigation intents.
        const next = { ...current, state: { ...current.state } };
        if (data.gotoStep) next.state.currentStep = data.gotoStep;
        else if (data.advanceStep)
          next.state.currentStep = Math.min(next.state.currentStep + 1, next.state.totalSteps);
        if (data.preference) next.state.preferences = [...next.state.preferences, data.preference];
        next.state.status =
          next.state.currentStep >= next.state.totalSteps && data.advanceStep ? "COMPLETED" : "COOKING";
        persist(next);

        await say(data.answer);
      } catch {
        await say("I lost my connection for a second. Please ask again.");
      } finally {
        busyRef.current = false;
      }
    },
    [persist, say, stop],
  );

  const onWake = useCallback(() => {
    stop();
    setVoiceState("LISTENING");
  }, [stop]);

  const { awake, heard, micError, listening } = useWakeWord({
    enabled: started,
    onWake,
    onQuestion: handleQuestion,
  });

  // Keep the visual state machine in sync with what's actually happening.
  useEffect(() => {
    if (!started) return;
    if (busyRef.current) return;
    if (awake) setVoiceState("LISTENING");
    else if (speaking) setVoiceState("SPEAKING");
    else setVoiceState(listening ? "LISTENING_FOR_WAKE_WORD" : "READY");
  }, [awake, speaking, listening, started]);

  const start = useCallback(async () => {
    const current = sessionRef.current;
    if (!current) return;
    setStarted(true);
    const next = { ...current, state: { ...current.state, status: "COOKING" as const } };
    persist(next);
    await say(
      `Let's cook ${current.recipe.title}. Step 1 of ${current.state.totalSteps}. ${current.recipe.steps[0] ?? ""}`,
    );
  }, [persist, say]);

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading your recipe…</p>
      </main>
    );
  }

  const { recipe, state } = session;
  const stepText = recipe.steps[state.currentStep - 1] ?? "";
  const progress = Math.round((state.currentStep / Math.max(state.totalSteps, 1)) * 100);

  return (
    <main className="min-h-screen bg-background px-4 pb-16 pt-6">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <ChefHat className="h-5 w-5 text-primary" aria-hidden />
            <span className="font-display text-sm font-bold tracking-[0.22em]">SOUSVOICE</span>
          </Link>
          {session.demoMode ? (
            <span className="rounded-full bg-secondary px-3 py-1 text-xs font-bold">Demo mode</span>
          ) : null}
        </header>

        <h1 className="mt-5 font-display text-3xl font-bold sm:text-4xl">{recipe.title}</h1>
        <div className="mt-3 flex items-center gap-3">
          <span className="label-caps">
            Step {state.currentStep} / {state.totalSteps}
          </span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <section className="surface-card mt-6 p-6">
          <p className="label-caps">Your next move</p>
          <p className="mt-2 text-2xl font-bold leading-snug sm:text-3xl">{stepText}</p>
        </section>

        {micError ? (
          <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            {micError === "unsupported"
              ? "Hands-free voice isn't supported in this browser. Try Chrome for the best experience — you can still use the text box below."
              : micError === "denied"
                ? 'SousVoice needs microphone access to listen for "Hey Chef". Please allow microphone access and reload.'
                : "We couldn't reach your microphone. Check that it's connected, then reload."}
          </p>
        ) : null}

        {!started ? (
          <button
            onClick={start}
            className="mt-6 inline-flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary font-display text-lg font-bold text-primary-foreground shadow-[var(--shadow-lift)] transition hover:brightness-105"
          >
            <Play className="h-5 w-5" aria-hidden />
            Start Cooking — then put your device down
          </button>
        ) : (
          <div className="mt-4">
            <VoiceOrb state={voiceState} heard={heard} />
            <p className="text-center text-sm text-muted-foreground">
              Try: “Hey Chef, what&apos;s next?” · “Hey Chef, how much yogurt?” · “Okay, continue.”
            </p>
          </div>
        )}

        {turns.length ? (
          <section className="mt-8 space-y-2" aria-label="Conversation">
            <p className="label-caps">Conversation</p>
            {turns.slice(-8).map((t, i) => (
              <p
                key={i}
                className={`rounded-xl px-4 py-2 text-base ${
                  t.who === "you"
                    ? "bg-secondary/60 text-secondary-foreground"
                    : "bg-card font-semibold shadow-[var(--shadow-lift)]"
                }`}
              >
                <span className="label-caps mr-2">{t.who === "you" ? "You" : "Chef"}</span>
                {t.text}
              </p>
            ))}
          </section>
        ) : null}

        <section className="mt-8" aria-label="Ingredients">
          <p className="label-caps">Ingredients</p>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {recipe.ingredients.map((ing) => (
              <li key={ing} className="text-base font-bold">
                {ing}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-8 rounded-2xl bg-secondary/40 p-4" aria-label="Fallback controls">
          <p className="label-caps">Backup controls (voice is the main way to use SousVoice)</p>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const q = typed;
              setTyped("");
              void handleQuestion(q);
            }}
          >
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="Type a question instead…"
              className="h-11 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              className="inline-flex h-11 items-center gap-1 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground"
            >
              <Send className="h-4 w-4" aria-hidden /> Ask
            </button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => void handleQuestion("what's next")}
              className="inline-flex items-center gap-1 rounded-lg bg-card px-3 py-2 text-sm font-bold"
            >
              <ArrowRight className="h-4 w-4" aria-hidden /> Next step
            </button>
            <button
              onClick={() => void handleQuestion("repeat that")}
              className="inline-flex items-center gap-1 rounded-lg bg-card px-3 py-2 text-sm font-bold"
            >
              <RotateCcw className="h-4 w-4" aria-hidden /> Repeat
            </button>
            {recipe.sourceUrl ? (
              <a
                href={recipe.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg bg-card px-3 py-2 text-sm font-bold"
              >
                <Youtube className="h-4 w-4" aria-hidden /> Original video
              </a>
            ) : null}
          </div>
          {notice ? <p className="mt-2 text-sm text-muted-foreground">{notice}</p> : null}
        </section>
      </div>
    </main>
  );
}
