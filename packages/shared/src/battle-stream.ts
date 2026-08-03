import type { BattlePublic } from "./battle.js";
import type { SpeechLine } from "./narrative.js";

/** Progress phases during a streamed battle advance. */
export type BattleAdvancePhase =
  | "resolving"
  | "agents"
  | "narrating"
  | "finalizing";

/**
 * Server-sent events for POST /api/battles/:id/advance/stream.
 * Clients should apply `done.battle` as the authoritative state.
 */
export type BattleAdvanceStreamEvent =
  | { type: "phase"; phase: BattleAdvancePhase }
  | {
      type: "narrator";
      /** Completed narrator lines so far (JSON-stream extracted). */
      lines: string[];
      /** Incomplete trailing line while tokens are still arriving. */
      draft?: string | null;
      turn?: number;
    }
  | { type: "speeches"; speeches: SpeechLine[] }
  | { type: "done"; battle: BattlePublic }
  | { type: "error"; message: string };

/**
 * Extract completed `"narrator": [...]` string elements from a partial JSON
 * buffer produced by a streaming chat completion.
 */
export function extractStreamingNarrator(buffer: string): {
  lines: string[];
  draft: string | null;
} {
  const key = buffer.match(/"narrator"\s*:\s*\[/);
  if (!key || key.index === undefined) {
    return { lines: [], draft: null };
  }
  let i = key.index + key[0].length;
  const lines: string[] = [];
  let draft: string | null = null;

  while (i < buffer.length) {
    while (i < buffer.length && /[\s,]/.test(buffer[i]!)) i += 1;
    if (i >= buffer.length) break;
    if (buffer[i] === "]") break;
    if (buffer[i] !== '"') break;
    i += 1;
    let s = "";
    let closed = false;
    while (i < buffer.length) {
      const ch = buffer[i]!;
      if (ch === "\\" && i + 1 < buffer.length) {
        const n = buffer[i + 1]!;
        if (n === "n") s += "\n";
        else if (n === "t") s += "\t";
        else if (n === "r") s += "\r";
        else if (n === '"') s += '"';
        else if (n === "\\") s += "\\";
        else if (n === "/") s += "/";
        else if (n === "u" && i + 5 < buffer.length) {
          const hex = buffer.slice(i + 2, i + 6);
          const code = Number.parseInt(hex, 16);
          s += Number.isFinite(code) ? String.fromCharCode(code) : `u${hex}`;
          i += 6;
          continue;
        } else s += n;
        i += 2;
        continue;
      }
      if (ch === '"') {
        closed = true;
        i += 1;
        break;
      }
      s += ch;
      i += 1;
    }
    if (closed) lines.push(s);
    else {
      draft = s;
      break;
    }
  }
  return { lines, draft };
}
