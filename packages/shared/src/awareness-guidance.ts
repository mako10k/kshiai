// R: Define evaluated conscious guidance delivery and its projection into existing private input fields.
import { z } from "zod";

export const AwarenessConsciousGuidanceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({ kind: z.literal("applicable"), actionPrinciples: z.array(z.string().min(1).max(2400)).min(1) }).strict(),
]);
export type AwarenessConsciousGuidance = z.infer<typeof AwarenessConsciousGuidanceSchema>;

export function evaluatedAwarenessConsciousGuidance(actionPrinciples: readonly string[]): AwarenessConsciousGuidance {
  return AwarenessConsciousGuidanceSchema.parse(actionPrinciples.length === 0
    ? { kind: "none" }
    : { kind: "applicable", actionPrinciples: [...actionPrinciples] });
}

export function appendAwarenessConsciousGuidance(characteristics: readonly string[], guidance: AwarenessConsciousGuidance): string[] {
  const evaluated = AwarenessConsciousGuidanceSchema.parse(guidance);
  return [...characteristics, ...(evaluated.kind === "applicable" ? evaluated.actionPrinciples : [])];
}
