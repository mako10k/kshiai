import { z } from "zod";

export const SpeechLineSchema = z.object({
  speaker: z.string(),
  text: z.string(),
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
  const lines: string[] = [];
  for (const n of block.narrator) {
    lines.push(n);
  }
  for (const s of block.speeches) {
    lines.push(formatSpeech(s));
  }
  return lines;
}
