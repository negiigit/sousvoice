import type { RecipeChunk } from "./recipe-types";

const COLLECTION = "sousvoice_recipes";
const VECTOR_SIZE = 768;

function config() {
  const url = process.env["QDRANT_URL"];
  const apiKey = process.env["QDRANT_API_KEY"];
  const geminiKey = process.env["GEMINI_API_KEY"];
  if (!url || !apiKey || !geminiKey) return null;
  return { url: url.replace(/\/$/, ""), apiKey, geminiKey };
}

export function qdrantEnabled(): boolean {
  return config() !== null;
}

async function embed(texts: string[], geminiKey: string): Promise<number[][]> {
  const out: number[][] = [];
  for (const text of texts) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "models/text-embedding-004", content: { parts: [{ text }] } }),
      },
    );
    if (!res.ok) throw new Error(`Embedding failed: ${res.status}`);
    const json = (await res.json()) as { embedding: { values: number[] } };
    out.push(json.embedding.values);
  }
  return out;
}

async function qdrant(path: string, init: RequestInit, cfg: NonNullable<ReturnType<typeof config>>) {
  const res = await fetch(`${cfg.url}${path}`, {
    ...init,
    headers: { "content-type": "application/json", "api-key": cfg.apiKey, ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Qdrant ${path} failed: ${res.status} ${await res.text().catch(() => "")}`);
  return res.json();
}

export async function upsertChunks(chunks: RecipeChunk[]): Promise<void> {
  const cfg = config();
  if (!cfg) throw new Error("Qdrant not configured");
  await qdrant(
    `/collections/${COLLECTION}`,
    { method: "PUT", body: JSON.stringify({ vectors: { size: VECTOR_SIZE, distance: "Cosine" } }) },
    cfg,
  ).catch(() => undefined); // already exists

  const vectors = await embed(chunks.map((c) => c.text), cfg.geminiKey);
  await qdrant(
    `/collections/${COLLECTION}/points?wait=true`,
    {
      method: "PUT",
      body: JSON.stringify({
        points: chunks.map((c, i) => ({ id: crypto.randomUUID(), vector: vectors[i], payload: c })),
      }),
    },
    cfg,
  );
}

export async function searchQdrant(
  question: string,
  sessionId: string,
  topK = 5,
): Promise<RecipeChunk[]> {
  const cfg = config();
  if (!cfg) throw new Error("Qdrant not configured");
  const [vector] = await embed([question], cfg.geminiKey);
  const json = (await qdrant(
    `/collections/${COLLECTION}/points/search`,
    {
      method: "POST",
      body: JSON.stringify({
        vector,
        limit: topK,
        with_payload: true,
        filter: { must: [{ key: "sessionId", match: { value: sessionId } }] },
      }),
    },
    cfg,
  )) as { result: Array<{ payload: RecipeChunk }> };
  return json.result.map((r) => r.payload);
}
