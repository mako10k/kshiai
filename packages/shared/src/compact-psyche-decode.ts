import { CharacterDeepPsycheCompactAdvanceSchema } from "./battle.js";

const FOCUS = new Set([
  "self_result",
  "counterpart_result",
  "ambient_change",
  "counterpart_speech",
]);

const ROOT_KEYS = [
  "delta",
  "expressionBrief",
  "observableManifestations",
  "narrativeCues",
] as const;

const DELTA_KEYS = [
  "privateMemory",
  "currentGoal",
  "emotion",
  "beliefs",
  "observations",
  "speechStyle",
  "interior",
  "dialogueThread",
] as const;

const INTERIOR_KEYS = [
  "primaryEmotion",
  "concealedEmotion",
  "coreNeed",
  "protectiveStance",
  "eventAppraisal",
  "unspokenIntent",
  "currentConcern",
  "attitudeTowardCounterpart",
  "confidence",
  "relationshipTension",
  "speechMode",
  "speechAppraisal",
] as const;

const APPRAISAL_KEYS = [
  "anticipatedImpact",
  "observedImpact",
  "anticipatedSocialCost",
  "observedSocialCost",
  "anticipatedSocialConsequence",
  "observedSocialConsequence",
  "nextApproach",
  "continuityPosture",
  "continuityBasis",
  "continuityDecision",
] as const;

const BRIEF_KEYS = [
  "sourceThread",
  "continuityDecision",
  "focus",
  "observedImpact",
  "relationshipMove",
  "publicAim",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function pick(
  record: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> {
  const selected: Record<string, unknown> = {};
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      selected[key] = record[key];
    }
  }
  return selected;
}

function liftCost(
  appraisal: Record<string, unknown>,
  costKey: "anticipatedSocialCost" | "observedSocialCost",
  consequenceKey: "anticipatedSocialConsequence" | "observedSocialConsequence",
): void {
  if (asRecord(appraisal[consequenceKey])) return;
  const cost = appraisal[costKey];
  if (typeof cost === "string" && cost.trim()) {
    appraisal[consequenceKey] = { bearer: "self", meaning: cost.trim() };
  }
}

function decodeFocus(value: unknown): unknown {
  const values = typeof value === "string"
    ? [value]
    : Array.isArray(value)
      ? value
      : [];
  return values
    .filter((item): item is string => typeof item === "string" && FOCUS.has(item))
    .slice(0, 2);
}

/**
 * Select the compact envelope before schema parse. Unknown keys are dropped;
 * required compact fields and continuity pairing remain the schema's job.
 */
export function decodeCompactDeepPsycheAdvance(raw: unknown): unknown {
  const root = asRecord(raw);
  if (!root) return raw;
  const deltaIn = asRecord(root.delta);
  const delta = deltaIn ? pick(deltaIn, DELTA_KEYS) : undefined;
  if (delta) {
    const interiorIn = asRecord(delta.interior);
    if (interiorIn) {
      const interior = pick(interiorIn, INTERIOR_KEYS);
      const appraisalIn = asRecord(interior.speechAppraisal);
      if (appraisalIn) {
        const appraisal = pick(appraisalIn, APPRAISAL_KEYS);
        liftCost(appraisal, "anticipatedSocialCost", "anticipatedSocialConsequence");
        liftCost(appraisal, "observedSocialCost", "observedSocialConsequence");
        interior.speechAppraisal = appraisal;
      }
      delta.interior = interior;
    }
  }
  const briefIn = asRecord(root.expressionBrief);
  const expressionBrief = briefIn ? pick(briefIn, BRIEF_KEYS) : undefined;
  if (expressionBrief && "focus" in expressionBrief) {
    expressionBrief.focus = decodeFocus(expressionBrief.focus);
  }
  return pick({
    ...(delta ? { delta } : {}),
    ...(expressionBrief ? { expressionBrief } : {}),
    ...(Object.prototype.hasOwnProperty.call(root, "observableManifestations")
      ? { observableManifestations: root.observableManifestations }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(root, "narrativeCues")
      ? { narrativeCues: root.narrativeCues }
      : {}),
  }, ROOT_KEYS);
}

export function compactDeepPsycheIssueSummaries(raw: unknown): Array<{
  path: string;
  code: string;
}> {
  const parsed = CharacterDeepPsycheCompactAdvanceSchema.safeParse(raw);
  if (parsed.success) return [];
  return parsed.error.issues.slice(0, 12).map((issue) => ({
    path: issue.path.map(String).join("."),
    code: issue.code,
  }));
}
