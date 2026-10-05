// R: Validate immutable receipt material and project phase results into presentation blocks.
import { NarrativeBlockSchema, type NarrativeBlock } from "@kshiai/shared";
import { AwarenessFrozenNarrationSchema, type AwarenessFrozenNarration, type AwarenessFrozenNarrationResult } from "../llm/awareness-frozen-narration.js";
import type { Entry } from "./awareness-narration-worker-contract.js";
export function narrative(material: AwarenessFrozenNarration, result: AwarenessFrozenNarrationResult): NarrativeBlock {
  if (result.battleId !== material.battleId || result.turnReceiptId !== material.turnReceiptId || result.phase !== material.phase) throw new Error("AWARENESS_NARRATION_RECEIPT_IDENTITY_MISMATCH");
  if (result.phase === "judgment") {
    if (!material.judgmentVerdict) throw new Error("AWARENESS_NARRATION_VERDICT_MISSING");
    return NarrativeBlockSchema.parse({ turn: material.turn, narrator: [...result.narration.before, "——判定——", material.judgmentVerdict, ...result.narration.after], speeches: [] });
  }
  if (result.phase === "aftermath") return NarrativeBlockSchema.parse({ turn: material.turn, narrator: [...result.narration.before, ...result.narration.after], speeches: result.narration.speeches });
  if (result.narration.turn !== material.turn) throw new Error("AWARENESS_NARRATION_TURN_MISMATCH");
  return NarrativeBlockSchema.parse({ turn: material.turn, narrator: result.narration.narrator, speeches: result.narration.speeches });
}
export function materialFromEntry(entry: Entry): AwarenessFrozenNarration {
  const raw: unknown = typeof entry.input_json === "string" ? JSON.parse(entry.input_json) : entry.input_json;
  const material = AwarenessFrozenNarrationSchema.parse(raw);
  if (material.battleId !== entry.battle_id || material.turnReceiptId !== entry.receipt_id || material.phase !== entry.phase) throw new Error("AWARENESS_FROZEN_NARRATION_IDENTITY_MISMATCH");
  return material;
}
