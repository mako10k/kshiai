import { z } from "zod";

const CHARACTER_NORM_EQUALITY_OPERATORS_V2 = ["is", "is_not"] as const;
const CHARACTER_NORM_ORDERED_OPERATORS_V2 = [
  "is",
  "is_not",
  "at_least",
  "at_most",
] as const;

export const CHARACTER_NORM_ALWAYS_VALUES_V2 = ["true"] as const;
export const CHARACTER_NORM_BATTLE_PHASES_V2 = [
  "prologue",
  "turn",
  "aftermath",
] as const;
export const CHARACTER_NORM_CONDITION_BANDS_V2 = [
  "steady",
  "strained",
  "critical",
  "incapacitated",
] as const;
export const CHARACTER_NORM_RESOURCE_BAND_VALUES_V2 = [
  "hp:empty",
  "hp:critical",
  "hp:low",
  "hp:taxed",
  "hp:ready",
  "hp:full",
  "mp:empty",
  "mp:critical",
  "mp:low",
  "mp:taxed",
  "mp:ready",
  "mp:full",
  "stamina:empty",
  "stamina:critical",
  "stamina:low",
  "stamina:taxed",
  "stamina:ready",
  "stamina:full",
  "focus:empty",
  "focus:critical",
  "focus:low",
  "focus:taxed",
  "focus:ready",
  "focus:full",
] as const;
export const CHARACTER_NORM_DISTANCE_BANDS_V2 = [
  "contact",
  "near",
  "medium",
  "far",
  "separate_area",
  "out_of_scene",
] as const;
export const CHARACTER_NORM_RELATIONSHIP_BANDS_V2 = [
  "stranger",
  "ally",
  "rival",
  "enemy",
  "mentor",
  "student",
  "family",
  "protected_person",
  "other",
] as const;
export const CHARACTER_NORM_OBSERVED_EVENT_KINDS_V2 = [
  "damage",
  "heal",
  "rest",
  "parameter",
  "defend",
  "wait",
  "reflect",
  "status",
  "situation",
  "info",
  "utterance",
  "manifestation",
  "free_action",
] as const;
export const CHARACTER_SPEECH_REACT_TO_V2 = [
  "direct_address",
  "self_impact",
  "counterpart_impact",
  "ambient_change",
  "relationship_shift",
] as const;

function characterNormClauseVariantV2<
  Kind extends string,
  Values extends readonly [string, ...string[]],
  Operators extends readonly [string, ...string[]],
>(
  kind: Kind,
  values: Values,
  operators: Operators,
) {
  return z.object({
    kind: z.literal(kind),
    operator: z.enum(operators),
    value: z.enum(values),
  }).strict();
}

export const CharacterNormClauseV2Schema = z.discriminatedUnion("kind", [
  characterNormClauseVariantV2(
    "always",
    CHARACTER_NORM_ALWAYS_VALUES_V2,
    CHARACTER_NORM_EQUALITY_OPERATORS_V2,
  ),
  characterNormClauseVariantV2(
    "battle_phase",
    CHARACTER_NORM_BATTLE_PHASES_V2,
    CHARACTER_NORM_EQUALITY_OPERATORS_V2,
  ),
  characterNormClauseVariantV2(
    "self_condition",
    CHARACTER_NORM_CONDITION_BANDS_V2,
    CHARACTER_NORM_ORDERED_OPERATORS_V2,
  ),
  characterNormClauseVariantV2(
    "counterpart_condition",
    CHARACTER_NORM_CONDITION_BANDS_V2,
    CHARACTER_NORM_ORDERED_OPERATORS_V2,
  ),
  characterNormClauseVariantV2(
    "resource_band",
    CHARACTER_NORM_RESOURCE_BAND_VALUES_V2,
    CHARACTER_NORM_ORDERED_OPERATORS_V2,
  ),
  characterNormClauseVariantV2(
    "distance_band",
    CHARACTER_NORM_DISTANCE_BANDS_V2,
    CHARACTER_NORM_ORDERED_OPERATORS_V2,
  ),
  characterNormClauseVariantV2(
    "relationship_band",
    CHARACTER_NORM_RELATIONSHIP_BANDS_V2,
    CHARACTER_NORM_EQUALITY_OPERATORS_V2,
  ),
  characterNormClauseVariantV2(
    "observed_event_kind",
    CHARACTER_NORM_OBSERVED_EVENT_KINDS_V2,
    CHARACTER_NORM_EQUALITY_OPERATORS_V2,
  ),
]);
export type CharacterNormClauseV2 = z.infer<
  typeof CharacterNormClauseV2Schema
>;

export function characterNormClauseVocabularyPromptV2(): string {
  return [
    "Action-norm observed_event_kind values are only",
    `${CHARACTER_NORM_OBSERVED_EVENT_KINDS_V2.join(", ")}.`,
    `speechPolicy.reactTo values (${CHARACTER_SPEECH_REACT_TO_V2.join(", ")})`,
    "are not observed_event_kind values.",
    "Being spoken to is observed_event_kind=utterance, not direct_address.",
  ].join(" ");
}
