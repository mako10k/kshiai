import { z } from "zod";
import type { CharacterAgentState, CharacterCognition } from "./battle.js";

/**
 * Match-level narrator camera / information rights (on NarrationStyle).
 * - self: user character (side A) inner life only
 * - foe: opponent (side B) inner life only
 * - external: no inner digests (surface action only)
 * - omniscient: both inners always
 * - fluid: each turn choose focus from summaries, then strip disallowed detail
 */
export const NarrationPerspectiveSchema = z.enum([
  "self",
  "foe",
  "external",
  "omniscient",
  "fluid",
]);
export type NarrationPerspective = z.infer<typeof NarrationPerspectiveSchema>;

/** Resolved per-turn focus after locked style or fluid choice. */
export const NarrationFocusSchema = z.enum([
  "self",
  "foe",
  "external",
  "both",
]);
export type NarrationFocus = z.infer<typeof NarrationFocusSchema>;

export const InnerDigestLevelSchema = z.enum(["summary", "detail"]);
export type InnerDigestLevel = z.infer<typeof InnerDigestLevelSchema>;

/** Sanitized character interior for the narrator (never raw chain-of-thought). */
export const InnerDigestSchema = z.object({
  side: z.enum(["a", "b"]),
  displayName: z.string(),
  level: InnerDigestLevelSchema,
  emotion: z.string().optional(),
  goal: z.string().optional(),
  condition: z.string().optional(),
  foeCondition: z.string().optional(),
  /** detail only */
  beliefs: z.array(z.string()).optional(),
  recentObservations: z.array(z.string()).optional(),
  privateHint: z.string().optional(),
  speechStyle: z.string().optional(),
  selfReference: z.string().nullable().optional(),
});
export type InnerDigest = z.infer<typeof InnerDigestSchema>;

export const PERSPECTIVE_LABELS: Record<NarrationPerspective, string> = {
  self: "一人称（自分側）",
  foe: "相手視点",
  external: "三人称限定",
  omniscient: "全知",
  fluid: "可変視点",
};

export function lockedFocusFromPerspective(
  perspective: NarrationPerspective,
): NarrationFocus | null {
  switch (perspective) {
    case "self":
      return "self";
    case "foe":
      return "foe";
    case "external":
      return "external";
    case "omniscient":
      return "both";
    case "fluid":
      return null;
  }
}

export function needsFocusChoice(perspective: NarrationPerspective): boolean {
  return perspective === "fluid";
}

/** Character continuity always advances; perspective only gates narrator access. */
export function agentsUsefulForPerspective(
  _perspective: NarrationPerspective,
): boolean {
  return true;
}

export function buildInnerDigest(input: {
  side: "a" | "b";
  displayName: string;
  agent: CharacterAgentState | null | undefined;
  cognition: CharacterCognition | null | undefined;
  level: InnerDigestLevel;
}): InnerDigest {
  const agent = input.agent;
  const cog = input.cognition;
  const base: InnerDigest = {
    side: input.side,
    displayName: input.displayName,
    level: input.level,
    emotion: agent?.emotion?.trim() || undefined,
    goal: agent?.currentGoal?.trim()?.slice(0, 120) || undefined,
    condition: cog?.ownCondition,
    foeCondition: cog?.foeCondition,
  };
  if (input.level === "summary") {
    return base;
  }
  return {
    ...base,
    beliefs: (agent?.beliefs ?? []).slice(-4),
    recentObservations: (agent?.observations ?? []).slice(-4),
    privateHint: (agent?.privateMemory ?? "").trim().slice(0, 280) || undefined,
    speechStyle: agent?.speechStyle?.trim() || undefined,
    selfReference: agent?.selfReference ?? null,
  };
}

/**
 * After focus is known, return only digests the narrator may see.
 * Fluid/omniscient use detail for allowed sides; external returns [].
 */
export function selectDigestsForFocus(input: {
  focus: NarrationFocus;
  detailA: InnerDigest;
  detailB: InnerDigest;
}): InnerDigest[] {
  switch (input.focus) {
    case "self":
      return [input.detailA];
    case "foe":
      return [input.detailB];
    case "both":
      return [input.detailA, input.detailB];
    case "external":
      return [];
  }
}

export function focusInstruction(focus: NarrationFocus): string {
  switch (focus) {
    case "self":
      return "Focus: side A (player character) only. You may use side A's innerDigest. Do NOT invent or reveal side B's private thoughts. Surface B only via visible actions/events.";
    case "foe":
      return "Focus: side B (opponent) only. You may use side B's innerDigest. Do NOT invent or reveal side A's private thoughts. Surface A only via visible actions/events.";
    case "both":
      return "Focus: omniscient. You may use both innerDigests and weave both interiors when useful. Do not dump secrets gratuitously; keep it dramatic.";
    case "external":
      return "Focus: external third person. No access to private interiors. Describe only observable action, field, and expression. Do not invent inner monologue.";
  }
}

export function parseNarrationFocus(raw: unknown): NarrationFocus | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (s === "self" || s === "a" || s === "side_a" || s === "player") return "self";
  if (s === "foe" || s === "b" || s === "side_b" || s === "opponent") return "foe";
  if (s === "external" || s === "none" || s === "third") return "external";
  if (s === "both" || s === "omniscient" || s === "all") return "both";
  return null;
}
