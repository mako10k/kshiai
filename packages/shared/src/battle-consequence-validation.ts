// R: Validate each participant's parameter deltas against source-owned consequence contributions.
import { z } from "zod";
import type { BattleConsequenceReceipt } from "./battle.js";

export function validateConsequenceParameters(
  receipts: readonly BattleConsequenceReceipt[],
  side: "a" | "b",
  expected: BattleConsequenceReceipt["parameterChanges"]["a"],
  ctx: z.RefinementCtx,
): void {
  const owners = new Map<string, number[]>();
  for (const receipt of receipts) {
    for (const [key, value] of Object.entries(receipt.parameterChanges[side])) {
      owners.set(key, [...(owners.get(key) ?? []), value]);
    }
  }
  for (const [key, value] of Object.entries(expected)) {
    const values = owners.get(key) ?? [];
    if (values.length === 0 || values.reduce((sum, item) => sum + item, 0) !== value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["consequenceReceipts"],
        message: `parameter delta ${side}.${key} must equal its source-owned contributions`,
      });
    }
  }
  for (const key of owners.keys()) {
    if (!(key in expected)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["consequenceReceipts"],
        message: `receipt owns absent parameter delta ${side}.${key}`,
      });
    }
  }

}
