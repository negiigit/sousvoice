import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Speaks text through Rime TTS (server-proxied, key stays server-side) and
 * falls back to browser SpeechSynthesis when Rime is unavailable.
 */
export function useSpeaker() {
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tokenRef = useRef(0);

  const stop = useCallback(() => {
    tokenRef.current += 1;
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  const speakWithBrowser = useCallback((text: string, token: number) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    const voices = window.speechSynthesis.getVoices();
    const preferred =
      voices.find((v) => /Google UK English Female|Samantha|Google US English/i.test(v.name)) ??
      voices.find((v) => v.lang?.startsWith("en"));
    if (preferred) u.voice = preferred;
    u.onend = () => {
      if (tokenRef.current === token) setSpeaking(false);
    };
    u.onerror = () => {
      if (tokenRef.current === token) setSpeaking(false);
    };
    window.speechSynthesis.speak(u);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      stop();
      const token = tokenRef.current;
      if (!text.trim()) return;
      setSpeaking(true);

      try {
        const res = await fetch("/api/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (tokenRef.current !== token) return;
        if (res.ok && res.status !== 204) {
          const blob = await res.blob();
          if (tokenRef.current !== token) return;
          const audio = new Audio(URL.createObjectURL(blob));
          audioRef.current = audio;
          audio.onended = () => {
            if (tokenRef.current === token) setSpeaking(false);
          };
          audio.onerror = () => speakWithBrowser(text, token);
          await audio.play().catch(() => speakWithBrowser(text, token));
          return;
        }
      } catch {
        /* fall through to browser speech */
      }
      if (tokenRef.current !== token) return;
      speakWithBrowser(text, token);
    },
    [speakWithBrowser, stop],
  );

  useEffect(() => stop, [stop]);

  return { speak, stop, speaking };
}
