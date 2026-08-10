export type Intent =
  | "NEXT"
  | "REPEAT"
  | "BACK"
  | "CONTINUE"
  | "STOP"
  | "INGREDIENTS"
  | "PREFERENCE"
  | "QUESTION";

const WAKE_PATTERNS = [
  /\bhey,?\s*chef\b/i,
  /\bhay,?\s*chef\b/i,
  /\bhi,?\s*chef\b/i,
  /\bay,?\s*chef\b/i,
  /\bhey,?\s*shef\b/i,
  /\bhey,?\s*che+f\b/i,
];

/** Returns the question after the wake phrase, or null if the wake phrase isn't present. */
export function extractAfterWakeWord(transcript: string): string | null {
  for (const re of WAKE_PATTERNS) {
    const m = re.exec(transcript);
    if (m) {
      return transcript.slice(m.index + m[0].length).replace(/^[\s,.!?-]+/, "").trim();
    }
  }
  return null;
}

export function containsWakeWord(transcript: string): boolean {
  return WAKE_PATTERNS.some((re) => re.test(transcript));
}

/** "Okay, continue" works without the wake phrase — it's the resume cue. */
export function isBareResume(transcript: string): boolean {
  return /\b(okay|ok|alright|right),?\s*(continue|carry on|go on|resume)\b/i.test(transcript);
}

export function classifyIntent(question: string): Intent {
  const q = question.toLowerCase().trim();
  if (!q) return "QUESTION";
  if (/^(wait|stop|pause|hold on|quiet|shush)\b/.test(q)) return "STOP";
  if (/\b(what'?s next|next step|next|move on)\b/.test(q)) return "NEXT";
  if (/\b(repeat|say (that )?again|what was that|current step)\b/.test(q)) return "REPEAT";
  if (/\b(go back|previous step|back a step|last step)\b/.test(q)) return "BACK";
  if (/\b(continue|carry on|resume|go on|i'?m done|done)\b/.test(q)) return "CONTINUE";
  if (/\b(ingredients|what do i need|shopping list)\b/.test(q)) return "INGREDIENTS";
  if (/\bi (don'?t|do not) (eat|like)\b|\bi'?m allergic\b|\bno more\b/.test(q)) return "PREFERENCE";
  return "QUESTION";
}
