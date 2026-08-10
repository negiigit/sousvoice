# SousVoice — Your voice-powered AI sous-chef

**Turn any YouTube recipe into a hands-free cooking experience.**

Paste a recipe video. Put your device down. Say **“Hey Chef.”** SousVoice guides you through every step, answers questions mid-cook, and resumes exactly where you left off.

## The problem

Cooking from a video means: watch → pause → touch device with messy hands → rewind → cook → repeat.

SousVoice replaces that with: **paste video → say “Hey Chef” → cook.**

## Hands-free interaction

Once cooking starts you never touch the screen:

1. The mic is granted once, at the start.
2. Browser speech recognition runs continuously, listening for the wake phrase **“Hey Chef”**.
3. The phrase after the wake word is captured as your question.
4. The question is answered and spoken aloud.
5. SousVoice returns to listening for “Hey Chef”.

If SousVoice is speaking and you say “Hey Chef”, playback stops immediately and it listens — natural interruption.

Voice state machine: `READY → LISTENING_FOR_WAKE_WORD → LISTENING → THINKING → SPEAKING → (INTERRUPTED)`.

The on-screen orb is a **visual indicator only**. The text box and quick buttons exist purely as accessibility/testing fallbacks.

## Architecture

```text
            YOUTUBE VIDEO URL
                   │
                   ▼
          TRANSCRIPT / CAPTIONS
                   │
                   ▼
                GEMINI  ──►  STRUCTURED RECIPE JSON
                   │
                   ▼
             RECIPE CHUNKS  ──►  EMBEDDINGS  ──►  QDRANT
                   │
        "Hey Chef, how much yogurt?"
                   │
                   ▼
            SPEECH → TEXT (browser)
                   │
                   ▼
             QDRANT RETRIEVAL
                   │
                   ▼
        GEMINI (+ current cooking step)
                   │
                   ▼
             SHORT AI ANSWER
                   │
                   ▼
      RIME TTS  (fallback: SpeechSynthesis)
                   │
                   ▼
             SPOKEN RESPONSE
                   │
                   ▼
         LISTEN FOR "HEY CHEF"
```

**Rule:** Qdrant stores *recipe knowledge only*. The cooking session (current step, status, preferences) lives in app/session state — never in Qdrant.

## Project layout

This build runs as a single full-stack app (TanStack Start + Vite) instead of separate `client/` and `server/` folders — the API routes are real server-side endpoints, so the Express layer isn't needed.

```text
src/
├── routes/
│   ├── index.tsx          # Landing page (paste YouTube URL)
│   ├── cook.tsx           # Hands-free cooking screen
│   └── api/
│       ├── prepare.ts     # URL → transcript → Gemini → chunks → Qdrant
│       ├── ask.ts         # question → retrieval → Gemini → short answer
│       └── tts.ts         # Rime TTS proxy (API key stays server-side)
├── components/VoiceOrb.tsx
├── hooks/
│   ├── useWakeWord.ts     # "Hey Chef" listener (modular — swap engines later)
│   └── useSpeaker.ts      # Rime → audio, SpeechSynthesis fallback
└── lib/
    ├── ai.server.ts       # YouTube captions + Gemini calls
    ├── qdrant.server.ts   # embeddings + vector upsert/search
    ├── retrieval.ts       # chunking + local (demo) retrieval
    ├── answer.ts          # deterministic sous-chef (demo + fallback)
    ├── intent.ts          # wake word + intent parsing
    └── session.ts         # cooking state persistence
```

## Run it

```bash
npm install
npm run dev
```

Open the dev URL (Vite prints it). No API keys are needed — DEMO_MODE is the default.

### Environment

Copy `.env.example` to `.env`:

```bash
PORT=4000
DEMO_MODE=true
GEMINI_API_KEY=
QDRANT_URL=
QDRANT_API_KEY=
RIME_API_KEY=
```

`.env` is gitignored. Never commit real keys, and never expose them to the browser.

## DEMO_MODE

With `DEMO_MODE=true` (default, and automatic when no `GEMINI_API_KEY` is set), the app runs fully offline:

- built-in **Paneer Tikka** recipe
- local keyword retrieval standing in for Qdrant
- deterministic sous-chef answers standing in for Gemini
- browser SpeechSynthesis for voice output
- full wake word, step tracking, interruption and resume

The demo feels like the real product — so a flaky API can't kill your presentation.

### Going live

Set `DEMO_MODE=false` and fill in the keys:

- **Gemini** — get a key at [aistudio.google.com](https://aistudio.google.com/apikey). Used for recipe extraction (transcript → structured JSON) and for short spoken answers. Also powers `text-embedding-004` embeddings.
- **Qdrant** — create a free cluster at [cloud.qdrant.io](https://cloud.qdrant.io), set `QDRANT_URL` and `QDRANT_API_KEY`. The `sousvoice_recipes` collection is created automatically.
- **Rime** — get a key at [rime.ai](https://rime.ai). Requests are proxied through `/api/tts`; if Rime fails or is unset, the browser voice takes over automatically.

## YouTube workflow

1. Paste a YouTube recipe URL that **has captions**.
2. The server validates the URL and extracts the video ID.
3. It requests the video's publicly available caption track (no downloading, no DRM circumvention).
4. Gemini converts the transcript into structured recipe JSON — quantities are never invented.
5. Chunks (`ingredient`, `step`, `timing`, `substitution`, `tip`) are embedded and stored in Qdrant.

If captions aren't available you'll see: *“This video doesn't have an accessible transcript. Please choose a recipe video with captions.”*

## Testing “Hey Chef”

Use Chrome, allow the microphone, press **Start Cooking**, then put the device down and try:

- “Hey Chef, how much yogurt?” → *“Half a cup of thick yogurt.”*
- “Hey Chef, how much paneer?” → *“250 grams of paneer.”*
- “Hey Chef, how long should I marinate it?” → *“At least 20 minutes.”*
- “Hey Chef, what's next?” → the next instruction (and the step advances)

## Testing interrupt & resume

1. Advance to step 5 (“marinate for at least 20 minutes”).
2. While SousVoice is speaking, say: **“Hey Chef, wait. How much lemon juice?”** — speech stops instantly and it answers *“One tablespoon of lemon juice.”*
3. Say **“Okay, continue.”** — SousVoice repeats where you were. Say “Hey Chef, what's next?” to move on.

The step counter never changes because you asked a question. Only explicit navigation (“what's next”, “go back”) moves it.

## Deploying

The app deploys as a single full-stack build. Frontend and API routes ship together, so set `DEMO_MODE`, `GEMINI_API_KEY`, `QDRANT_*`, and `RIME_API_KEY` as server environment variables in your host.

## Security notes

- `GEMINI_API_KEY`, `QDRANT_API_KEY` and `RIME_API_KEY` are read **only** in server code (`*.server.ts` and `src/routes/api/*`).
- No key is ever sent to the browser or referenced by a `VITE_` variable.
- Audio is generated server-side and streamed back as bytes.
