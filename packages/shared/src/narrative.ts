import { z } from "zod";

export const SPEAKER_DISPLAY_LABEL_MAX_LENGTH = 120;

/**
 * Accept narrator-authored presentation wording without turning it into a
 * canonical identity. Only transport/format failures fall back.
 */
export function coerceSpeakerDisplayLabel(
  value: unknown,
  fallback: string,
): string {
  if (typeof value !== "string") return fallback;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized || [...normalized].length > SPEAKER_DISPLAY_LABEL_MAX_LENGTH) {
    return fallback;
  }
  return normalized;
}

export const SpeechLineSchema = z.object({
  speaker: z.string(),
  text: z.string(),
  /** Character-side source authority. Omitted for legacy narrative blocks. */
  sourceSide: z.enum(["a", "b"]).optional(),
  /** Place after this zero-based narrator line; -1 means before the first line. */
  afterNarratorLine: z.number().int().min(-1).optional(),
});
export type SpeechLine = z.infer<typeof SpeechLineSchema>;

export const NarrativeBlockSchema = z.object({
  turn: z.number().int().nonnegative(),
  narrator: z.array(z.string()).default([]),
  speeches: z.array(SpeechLineSchema).default([]),
});
export type NarrativeBlock = z.infer<typeof NarrativeBlockSchema>;

/**
 * True for non-dialogue reactions (ellipsis, parenthetical stage direction).
 * These are shown without 「」 so quiet characters can still "react".
 */
export function isStageReaction(text: string): boolean {
  const body = text.replace(/^「/, "").replace(/」$/, "").trim();
  if (!body) return true;
  if (/^…+$/.test(body) || /^\.+$/.test(body) || /^・+$/.test(body)) return true;
  if (/^（[^）]*）$/.test(body)) return true;
  if (/^\([^)]*\)$/.test(body)) return true;
  return false;
}

/** Normalize agent speech: never empty; silent types become a minimal reaction. */
export function coerceCharacterSpeech(
  raw: string | null | undefined,
  opts?: { foeName?: string },
): string {
  const body = String(raw ?? "")
    .replace(/^「/, "")
    .replace(/」$/, "")
    .trim();
  if (body) return body;
  const foe = opts?.foeName?.trim();
  if (foe) return `（${foe}を見ている）`;
  return "…";
}

/** Format a character line: dialogue gets 「」, stage reactions do not. */
export function formatSpeech(line: SpeechLine): string {
  const body = coerceCharacterSpeech(line.text);
  if (isStageReaction(body)) {
    return `【${line.speaker}】${body}`;
  }
  return `【${line.speaker}】「${body}」`;
}

export function formatNarrativeBlock(block: NarrativeBlock): string[] {
  return narrativeEntries(block).map((entry) =>
    entry.kind === "narrator" ? entry.text : formatSpeech(entry.speech)
  );
}

export type NarrativeEntry =
  | { kind: "narrator"; text: string; narratorLine: number }
  | { kind: "speech"; speech: SpeechLine; speechLine: number };

/**
 * Interleave character speech at narrator-selected boundaries. Legacy speech
 * without placement remains after all narrator lines.
 */
export function narrativeEntries(block: NarrativeBlock): NarrativeEntry[] {
  const placed = new Map<number, Array<{ speech: SpeechLine; index: number }>>();
  const legacy: Array<{ speech: SpeechLine; index: number }> = [];
  block.speeches.forEach((speech, index) => {
    if (speech.afterNarratorLine === undefined) {
      legacy.push({ speech, index });
      return;
    }
    const boundary = Math.max(
      -1,
      Math.min(speech.afterNarratorLine, block.narrator.length - 1),
    );
    placed.set(boundary, [
      ...(placed.get(boundary) ?? []),
      { speech, index },
    ]);
  });
  const entries: NarrativeEntry[] = [];
  for (const item of placed.get(-1) ?? []) {
    entries.push({ kind: "speech", speech: item.speech, speechLine: item.index });
  }
  block.narrator.forEach((text, narratorLine) => {
    entries.push({ kind: "narrator", text, narratorLine });
    for (const item of placed.get(narratorLine) ?? []) {
      entries.push({ kind: "speech", speech: item.speech, speechLine: item.index });
    }
  });
  for (const item of legacy) {
    entries.push({ kind: "speech", speech: item.speech, speechLine: item.index });
  }
  return entries;
}
