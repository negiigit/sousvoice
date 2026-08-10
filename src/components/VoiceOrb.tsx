import { Mic, Loader2, Volume2, Ear } from "lucide-react";
import type { VoiceState } from "@/lib/recipe-types";

const COPY: Record<VoiceState, { title: string; hint: string }> = {
  READY: { title: 'Say "Hey Chef"', hint: "Voice ready" },
  LISTENING_FOR_WAKE_WORD: { title: "Listening…", hint: 'Say "Hey Chef" any time' },
  LISTENING: { title: "I'm listening", hint: "Ask your question" },
  THINKING: { title: "Thinking…", hint: "Checking the recipe" },
  SPEAKING: { title: "SousVoice is speaking", hint: 'Say "Hey Chef" to interrupt' },
  INTERRUPTED: { title: "Paused", hint: 'Say "Okay, continue" to resume' },
};

export function VoiceOrb({ state, heard }: { state: VoiceState; heard: string }) {
  const copy = COPY[state];
  const active = state === "LISTENING";
  const speaking = state === "SPEAKING";
  const thinking = state === "THINKING";

  return (
    <div className="flex flex-col items-center gap-4 py-2">
      <div className="relative flex h-40 w-40 items-center justify-center sm:h-48 sm:w-48">
        <span
          className={`absolute inset-0 rounded-full bg-primary/40 ${
            active ? "orb-ring" : speaking ? "orb-ring" : "opacity-25"
          }`}
          style={active ? { animationDuration: "1.4s" } : undefined}
        />
        <span className="absolute inset-6 rounded-full bg-secondary/70" />
        <span
          className={`relative flex h-24 w-24 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[var(--shadow-warm)] sm:h-28 sm:w-28 ${
            active || speaking ? "orb-breathe" : ""
          }`}
        >
          {thinking ? (
            <Loader2 className="h-10 w-10 animate-spin" aria-hidden />
          ) : speaking ? (
            <Volume2 className="h-10 w-10" aria-hidden />
          ) : active ? (
            <Mic className="h-10 w-10" aria-hidden />
          ) : (
            <Ear className="h-10 w-10" aria-hidden />
          )}
        </span>
      </div>

      <div className="text-center" aria-live="polite">
        <p className="font-display text-2xl font-bold sm:text-3xl">{copy.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{copy.hint}</p>
        {heard ? (
          <p className="mt-3 max-w-md text-base font-semibold text-foreground">“{heard}”</p>
        ) : null}
      </div>
    </div>
  );
}
