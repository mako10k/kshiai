// R: Render current phase output contracts and upgrade only registered historical wire instructions.
import type { NarrationFocus } from "@kshiai/shared";
export type NarrationPhase = "combat" | "prologue" | "aftermath" | "judgment";
export interface NarrationPromptContract {
  speechSurface(phase: NarrationPhase): string;
  output(phase: NarrationPhase, focus: NarrationFocus): string;
}
const legacyOutput = {
  combat: (focus: NarrationFocus) => `JSON: { "turn": number, "focus": "${focus}", "narrator": string[], "speeches": [ { "sourceSide": "a"|"b"|null, "speaker": string, "text": string, "afterNarratorLine": number } ], "recognitionUpdates": [ { "subjectRef": string, "recognizedAs": string, "identityKnowledge": "unknown"|"suspected"|"identified", "continuity": "same_entity"|"possibly_same_entity"|"unlinked" } ] }`,
  prologue: (_focus: NarrationFocus) => `JSON: { "turn": 0, "narrator": string[], "speeches": [ { "sourceSide": "a"|"b"|null, "speaker": string, "text": string, "afterNarratorLine": number } ], "recognitionUpdates": [ { "subjectRef": string, "recognizedAs": string, "identityKnowledge": "unknown"|"suspected"|"identified", "continuity": "same_entity"|"possibly_same_entity"|"unlinked" } ] }`,
  aftermath: (_focus: NarrationFocus) => `JSON: { "before": string[], "after": string[], "speeches": [ { "sourceSide": "a"|"b"|null, "speaker": string, "text": string, "afterNarratorLine": number } ], "recognitionUpdates": [ { "subjectRef": string, "recognizedAs": string, "identityKnowledge": "unknown"|"suspected"|"identified", "continuity": "same_entity"|"possibly_same_entity"|"unlinked" } ] }`,
  judgment: (_focus: NarrationFocus) => `JSON: { "before": string[], "after": string[] }. Each array has at most 2 short lines.`,
};
export const LEGACY_NARRATION_CONTRACT: NarrationPromptContract = {
  speechSurface(phase) {
    if (phase === "combat") return "You may change punctuation or typographic surface only when the words, factual content, intent, and stage-reaction/dialogue distinction remain unchanged.";
    if (phase === "prologue") return "You may change punctuation or typographic surface only when words, facts, intent, and the dialogue/stage-reaction distinction remain unchanged.";
    return "You may change punctuation or typographic surface only when words, facts, intent, and dialogue/stage-reaction distinction remain unchanged.";
  },
  output: (phase, focus) => legacyOutput[phase](focus),
};
export const CONTENT_ONLY_NARRATION_CONTRACT: NarrationPromptContract = {
  speechSurface: () => "Preserve each supplied speech text exactly, including punctuation, whitespace, and typographic surface. Never normalize, paraphrase, or rewrite it.",
  output: (phase) => phase === "judgment" ? "Each framing array has at most 2 short lines." : phase === "aftermath" ? "Each framing array has at most 3 short lines." : "",
};

/** Direct consumers retain their single-phase DTO; only instructions are upgraded. */
export const CURRENT_DIRECT_NARRATION_CONTRACT: NarrationPromptContract = {
  speechSurface: CONTENT_ONLY_NARRATION_CONTRACT.speechSurface,
  output(phase) {
    const speechFields = `"speeches": [{"sourceSide":"a"|"b"|null,"speaker":string,"text":string,"afterNarratorLine":number}], "recognitionUpdates": [{"subjectRef":string,"recognizedAs":string,"identityKnowledge":"unknown"|"suspected"|"identified","continuity":"same_entity"|"possibly_same_entity"|"unlinked"}]`;
    if (phase === "judgment") return 'Return JSON only: {"before":string[],"after":string[]}. Each array has 0–2 nonempty short lines. No other fields.';
    if (phase === "aftermath") return `Return JSON only: {"before":string[],"after":string[],${speechFields}}. Each framing array has 0–3 nonempty short lines. afterNarratorLine is -1 or an index into the combined before/after lines. No other fields.`;
    return `Return JSON only: {"turn":number,"narrator":string[],${speechFields}}. narrator has ${phase === "prologue" ? "4–8" : "2–4"} nonempty lines. Copy the supplied turn (${phase === "prologue" ? "0" : "the committed turn"}). afterNarratorLine is -1 or an existing narrator line index. No other fields, including focus.`;
  },
};

/** Upgrade only registered legacy wire instructions; preserve frozen style and observer rules. */
export function currentNarrationContentRules(system: string, phase: NarrationPhase): string {
  const registered = new Set(["self", "foe", "both", "external"].map((focus) => {
    const knownFocus: NarrationFocus = focus === "self" ? "self" : focus === "foe" ? "foe" : focus === "both" ? "both" : "external";
    return LEGACY_NARRATION_CONTRACT.output(phase, knownFocus);
  }));
  const content = system.split("\n").map((line) => registered.has(line)
    ? CONTENT_ONLY_NARRATION_CONTRACT.output(phase, "external") : line).join("\n");
  const oldPermission = LEGACY_NARRATION_CONTRACT.speechSurface(phase);
  return content.split(oldPermission).join(CONTENT_ONLY_NARRATION_CONTRACT.speechSurface(phase));
}
