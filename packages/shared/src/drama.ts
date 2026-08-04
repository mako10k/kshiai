import { z } from "zod";
import type { NarrativeBlock } from "./narrative.js";
import type { ResolvedBattleAction } from "./battle.js";

export const DramaPhaseSchema = z.enum(["opening", "rising", "climax"]);
export type DramaPhase = z.infer<typeof DramaPhaseSchema>;

export const DramaStateSchema = z.object({
  lastActionSignatureA: z.string().max(160).nullable().default(null),
  lastActionSignatureB: z.string().max(160).nullable().default(null),
  repeatedActionA: z.number().int().nonnegative().default(0),
  repeatedActionB: z.number().int().nonnegative().default(0),
  turnsSinceLocationChange: z.number().int().nonnegative().default(0),
  turnsSinceEnvironmentBeat: z.number().int().nonnegative().default(0),
  phase: DramaPhaseSchema.default("opening"),
  recentBeatFingerprints: z.array(z.string().max(200)).max(3).default([]),
  lastPublicSpeechA: z.string().max(400).nullable().default(null),
  lastPublicSpeechB: z.string().max(400).nullable().default(null),
});
export type DramaState = z.infer<typeof DramaStateSchema>;

export function normalizeDramaState(value: unknown): DramaState {
  const parsed = DramaStateSchema.safeParse(value);
  return parsed.success ? parsed.data : DramaStateSchema.parse({});
}

export function dramaPhaseForTurn(turn: number, turnLimit: number): DramaPhase {
  if (turn >= Math.min(10, Math.max(3, turnLimit - 2))) return "climax";
  if (turn >= 3) return "rising";
  return "opening";
}

export function actionSignature(
  action: ResolvedBattleAction | undefined,
): string | null {
  if (!action) return null;
  return `${action.kind}:${action.skillId ?? "-"}:${action.executed ? "1" : "0"}`;
}

/** Parse a drama action signature into kind/skill for variety avoidance. */
export function parseActionSignature(signature: string | null | undefined): {
  kind: string;
  skillId: string | null;
} | null {
  if (!signature) return null;
  const [kind, skillId] = signature.split(":");
  if (!kind) return null;
  return {
    kind,
    skillId: !skillId || skillId === "-" ? null : skillId,
  };
}

/**
 * Human-readable progression cue for the narrator. Derived only from drama
 * continuity already on the battle — no new LLM call.
 */
export function dramaProgressionHint(input: {
  phase: DramaPhase;
  turn: number;
  turnLimit: number;
  repeatedActionA: number;
  repeatedActionB: number;
  lastActionSignatureA: string | null;
  lastActionSignatureB: string | null;
  recentBeatFingerprints: string[];
  turnsSinceLocationChange: number;
}): string {
  const sameExchange =
    input.recentBeatFingerprints.length >= 2 &&
    input.recentBeatFingerprints.every(
      (fp) => fp === input.recentBeatFingerprints[0],
    );
  const aWait = input.lastActionSignatureA?.startsWith("wait:") ?? false;
  const bWait = input.lastActionSignatureB?.startsWith("wait:") ?? false;
  // Prefer one-sided pressure when only one side is waiting — that is the
  // production monotony pattern (attacker loops while defender waits).
  if ((aWait && !bWait) || (bWait && !aWait)) {
    return "one_sided_pressure";
  }
  if (sameExchange && (input.repeatedActionA >= 2 || input.repeatedActionB >= 2)) {
    return "break_stalemate";
  }
  if (input.repeatedActionA >= 2 || input.repeatedActionB >= 2) {
    return "escalate_repeated_action";
  }
  if (input.turnsSinceLocationChange >= 4) {
    return "shift_space_or_leverage";
  }
  if (input.phase === "climax" || input.turn >= Math.max(3, input.turnLimit - 3)) {
    return "force_commitment";
  }
  if (input.phase === "opening") return "establish_and_probe";
  return "change_leverage";
}

function latestSpeech(
  block: NarrativeBlock,
  speaker: string,
): string | null {
  return [...block.speeches].reverse().find((line) => line.speaker === speaker)?.text ?? null;
}

export function advanceDramaState(input: {
  previous: DramaState | null | undefined;
  turn: number;
  turnLimit: number;
  actions: ResolvedBattleAction[];
  narrative: NarrativeBlock;
  sideAName: string;
  sideBName: string;
  locationChanged: boolean;
  environmentBeatOccurred: boolean;
}): DramaState {
  const previous = normalizeDramaState(input.previous);
  const signatureA = actionSignature(input.actions.find((a) => a.actorSide === "a"));
  const signatureB = actionSignature(input.actions.find((a) => a.actorSide === "b"));
  const repeatedActionA = signatureA
    ? signatureA === previous.lastActionSignatureA
      ? previous.repeatedActionA + 1
      : 1
    : 0;
  const repeatedActionB = signatureB
    ? signatureB === previous.lastActionSignatureB
      ? previous.repeatedActionB + 1
      : 1
    : 0;
  const fingerprint = `${signatureA ?? "-"}|${signatureB ?? "-"}|${input.locationChanged ? "move" : "still"}`;
  return {
    lastActionSignatureA: signatureA,
    lastActionSignatureB: signatureB,
    repeatedActionA,
    repeatedActionB,
    turnsSinceLocationChange: input.locationChanged
      ? 0
      : previous.turnsSinceLocationChange + 1,
    turnsSinceEnvironmentBeat: input.environmentBeatOccurred
      ? 0
      : previous.turnsSinceEnvironmentBeat + 1,
    phase: dramaPhaseForTurn(input.turn, input.turnLimit),
    recentBeatFingerprints: [
      ...previous.recentBeatFingerprints,
      fingerprint,
    ].slice(-3),
    lastPublicSpeechA:
      latestSpeech(input.narrative, input.sideAName) ?? previous.lastPublicSpeechA,
    lastPublicSpeechB:
      latestSpeech(input.narrative, input.sideBName) ?? previous.lastPublicSpeechB,
  };
}
