import { useCallback, useEffect, useRef, useState } from "react";
import { containsWakeWord, extractAfterWakeWord, isBareResume } from "@/lib/intent";
import { getSpeechRecognition, type SpeechRecognitionLike } from "@/lib/speech-recognition";

export type MicError = "unsupported" | "denied" | "unavailable" | null;

interface Options {
  /** Called the moment "Hey Chef" is heard — used to duck/stop current speech. */
  onWake: () => void;
  /** Called with the captured question once the user stops talking. */
  onQuestion: (question: string) => void;
  enabled: boolean;
}

const SILENCE_MS = 1600;

/**
 * Always-on wake-word listener. Continuously runs browser SpeechRecognition,
 * watches for "Hey Chef", then captures the question that follows.
 * Modular by design: swap this hook for a dedicated wake-word engine later.
 */
export function useWakeWord({ onWake, onQuestion, enabled }: Options) {
  const [awake, setAwake] = useState(false);
  const [heard, setHeard] = useState("");
  const [micError, setMicError] = useState<MicError>(null);
  const [listening, setListening] = useState(false);

  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const enabledRef = useRef(enabled);
  const awakeRef = useRef(false);
  const pendingRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cbRef = useRef({ onWake, onQuestion });
  cbRef.current = { onWake, onQuestion };
  enabledRef.current = enabled;

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const submit = useCallback(() => {
    clearTimer();
    const q = pendingRef.current.trim();
    pendingRef.current = "";
    awakeRef.current = false;
    setAwake(false);
    setHeard("");
    if (q) cbRef.current.onQuestion(q);
  }, []);

  const armTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      if (pendingRef.current.trim()) submit();
      else {
        awakeRef.current = false;
        setAwake(false);
        setHeard("");
      }
    }, SILENCE_MS);
  }, [submit]);

  useEffect(() => {
    if (!enabled) return;
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setMicError("unsupported");
      return;
    }

    let stopped = false;
    let restart: ReturnType<typeof setTimeout> | null = null;
    const rec = new Ctor();
    recRef.current = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.maxAlternatives = 1;

    rec.onstart = () => {
      setListening(true);
      setMicError(null);
    };

    rec.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      if (!last) return;
      const text = (last[0]?.transcript ?? "").trim();
      if (!text) return;

      if (!awakeRef.current) {
        if (containsWakeWord(text)) {
          awakeRef.current = true;
          setAwake(true);
          cbRef.current.onWake();
          pendingRef.current = extractAfterWakeWord(text) ?? "";
          setHeard(pendingRef.current);
          if (last.isFinal && pendingRef.current.trim()) submit();
          else armTimer();
          return;
        }
        if (last.isFinal && isBareResume(text)) {
          cbRef.current.onQuestion("continue");
        }
        return;
      }

      const after = extractAfterWakeWord(text);
      pendingRef.current = (after ?? text).trim();
      setHeard(pendingRef.current);
      if (last.isFinal && pendingRef.current) submit();
      else armTimer();
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMicError("denied");
        stopped = true;
      } else if (e.error === "audio-capture") {
        setMicError("unavailable");
        stopped = true;
      }
    };

    rec.onend = () => {
      setListening(false);
      if (stopped || !enabledRef.current) return;
      restart = setTimeout(() => {
        try {
          rec.start();
        } catch {
          /* already starting */
        }
      }, 350);
    };

    try {
      rec.start();
    } catch {
      /* already started */
    }

    return () => {
      stopped = true;
      enabledRef.current = false;
      clearTimer();
      if (restart) clearTimeout(restart);
      rec.onend = null;
      rec.onresult = null;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      recRef.current = null;
      setListening(false);
    };
  }, [enabled, armTimer, submit]);

  return { awake, heard, micError, listening };
}
