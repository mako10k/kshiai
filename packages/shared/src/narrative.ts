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

/** Ensure character lines use Japanese quotation marks. */
export function formatSpeech(line: SpeechLine): string {
  const body = line.text.replace(/^「/, "").replace(/」$/, "");
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
