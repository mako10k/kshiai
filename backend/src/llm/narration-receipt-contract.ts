// R: Render a single complete strict receipt wire contract from immutable phase identities.
import type { AwarenessFrozenNarration } from "@kshiai/shared";
export function narrationReceiptExample(materials: readonly AwarenessFrozenNarration[]) {
  return { receipts: materials.map((material) => {
    const identity = { phase: material.phase, battleId: material.battleId, turnReceiptId: material.turnReceiptId, turn: material.turn };
    if (material.phase === "judgment") return { ...identity, before: [], after: [] };
    const speeches = material.sourceSpeeches.map((speech) => ({ sourceSide: speech.side, speaker: "発話者", text: speech.text, afterNarratorLine: 0 }));
    if (material.phase === "aftermath") return { ...identity, before: ["静けさが戻る。"], after: [], speeches, recognitionUpdates: [] };
    return { ...identity, narrator: material.phase === "prologue" ? ["場が静まる。", "二つの姿が現れる。", "向き合う。", "始まりを待つ。"] : ["姿が動く。", "場に変化が残る。"], speeches, recognitionUpdates: [] };
  }) };
}
export function narrationReceiptContract(materials: readonly AwarenessFrozenNarration[]): string {
  return [
    "Return JSON only with exactly one top-level receipts array, preserving input order and covering every receipt exactly once. Every receipt requires phase, battleId, turnReceiptId, turn copied exactly from its input identity. No other fields, including focus, are allowed.",
    "combat: narrator has 2–4 nonempty strings. prologue: narrator has 4–8 nonempty strings. Both require speeches and recognitionUpdates arrays. aftermath: before and after each have 0–3 nonempty strings, plus speeches and recognitionUpdates arrays. judgment: only identity and before/after arrays, each with 0–2 nonempty strings; no speeches or recognitionUpdates.",
    "Every speech has exactly sourceSide (a|b|null), speaker (nonempty string), text (nonempty string), afterNarratorLine (-1 or a zero-based existing narrator line index; aftermath indexes the combined before/after lines). Copy every committed source text exactly once, preserving punctuation and whitespace. Third-party sourceSide=null speech needs supplied scene evidence. recognitionUpdates may only use supplied subjectRef and must contain recognizedAs, identityKnowledge (unknown|suspected|identified), continuity (same_entity|possibly_same_entity|unlinked). Omit unsupported updates by using an empty array. Never move speech or facts between receipts.",
    "Schema-valid shape example (illustrative prose only; generate grounded prose from each supplied receipt): " + JSON.stringify(narrationReceiptExample(materials)),
  ].join("\n");
}
