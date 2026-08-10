import type { Recipe } from "./recipe-types";

export function isDemoMode(): boolean {
  const v = process.env["DEMO_MODE"];
  if (v === undefined) return !process.env["GEMINI_API_KEY"];
  return v !== "false";
}

export function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname === "youtu.be") return u.pathname.slice(1) || null;
    if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
    if (u.pathname === "/watch") return u.searchParams.get("v");
    const m = /^\/(embed|shorts|live)\/([^/?]+)/.exec(u.pathname);
    return m ? m[2] : null;
  } catch {
    return null;
  }
}

/** Best-effort caption fetch using YouTube's public timedtext endpoints. No downloading, no DRM. */
export async function fetchTranscript(videoId: string): Promise<string | null> {
  try {
    const page = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { "accept-language": "en-US,en;q=0.9", "user-agent": "Mozilla/5.0" },
    });
    if (!page.ok) return null;
    const html = await page.text();
    const m = /"captionTracks":(\[.*?\])/.exec(html);
    if (!m) return null;
    const tracks: Array<{ baseUrl: string; languageCode: string }> = JSON.parse(
      m[1].replace(/\\u0026/g, "&").replace(/\\"/g, '"'),
    );
    const track = tracks.find((t) => t.languageCode?.startsWith("en")) ?? tracks[0];
    if (!track?.baseUrl) return null;
    const xmlRes = await fetch(track.baseUrl);
    if (!xmlRes.ok) return null;
    const xml = await xmlRes.text();
    const text = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
      .map((t) =>
        t[1]
          .replace(/&amp;#39;/g, "'")
          .replace(/&#39;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, "&")
          .replace(/<[^>]+>/g, "")
          .trim(),
      )
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return text.length > 80 ? text : null;
  } catch {
    return null;
  }
}

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

async function gemini(messages: Array<{ role: string; content: string }>): Promise<string> {
  const key = process.env["GEMINI_API_KEY"] ?? process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("No AI key configured");
  const endpoint = process.env["GEMINI_API_KEY"]
    ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"
    : GATEWAY;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: process.env["GEMINI_API_KEY"] ? "gemini-2.0-flash" : "google/gemini-3.6-flash",
      messages,
    }),
  });
  if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text().catch(() => "")}`);
  const json = (await res.json()) as { choices: Array<{ message: { content: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

export async function extractRecipe(transcript: string, sourceUrl: string): Promise<Recipe> {
  const content = await gemini([
    {
      role: "system",
      content:
        "You extract cooking recipes from video transcripts. Return ONLY JSON with keys title, ingredients[], steps[], timings[], substitutions[], tips[]. Never invent quantities or instructions that aren't supported by the transcript; if ambiguous, keep the uncertainty in the wording.",
    },
    { role: "user", content: transcript.slice(0, 30000) },
  ]);
  const raw = content.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Partial<Recipe>;
  return {
    title: parsed.title || "Your Recipe",
    ingredients: parsed.ingredients ?? [],
    steps: parsed.steps ?? [],
    timings: parsed.timings ?? [],
    substitutions: parsed.substitutions ?? [],
    tips: parsed.tips ?? [],
    sourceUrl,
  };
}

export async function askGemini(prompt: string): Promise<string> {
  const out = await gemini([
    {
      role: "system",
      content:
        "You are SousVoice, a calm and helpful AI sous-chef. Answer in one or two short spoken sentences. Never invent information that isn't in the provided context. Do not restate the whole recipe.",
    },
    { role: "user", content: prompt },
  ]);
  return out.trim();
}
