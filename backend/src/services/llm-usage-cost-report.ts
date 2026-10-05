// R: Estimate recorded token charges from an explicit versioned price table without rewriting observations.
import { z } from "zod";
import type { LlmUsageAttempt } from "../repositories/llm-usage.js";
const rate = z.number().finite().nonnegative();
export const LlmUsagePriceTableSchema = z.object({ revision: z.string().min(1), entries: z.array(z.object({
  provider: z.string().min(1), model: z.string().min(1), inputUsdPerMillion: rate, cachedInputUsdPerMillion: rate, outputUsdPerMillion: rate,
}).strict()) }).strict().superRefine((table, context) => {
  const keys = table.entries.map((entry) => `${entry.provider}\u0000${entry.model}`);
  if (new Set(keys).size !== keys.length) context.addIssue({ code: z.ZodIssueCode.custom, message: "Duplicate provider/model price entries" });
});
export type LlmUsagePriceTable = z.infer<typeof LlmUsagePriceTableSchema>;
export type LlmUsageAttemptCost = { id: string; provider: string; model: string; role: string | null;
  knownCostUsd: number | null; complete: boolean; missingUsage: boolean; missingPrice: boolean; calculationImpossible: boolean };
export type LlmUsageTokenTotals = { promptTokens: { knownSubtotal: number; unknownCount: number }; completionTokens: { knownSubtotal: number; unknownCount: number };
  totalTokens: { knownSubtotal: number; unknownCount: number }; cachedTokens: { knownSubtotal: number; unknownCount: number }; reasoningTokens: { knownSubtotal: number; unknownCount: number } };
export type LlmUsageCostGroup = { provider: string; model: string; role: string | null; attemptCount: number; tokens: LlmUsageTokenTotals; knownSubtotalUsd: number; unknownCostCount: number };
export type LlmUsageCostReport = { label: "estimated usage cost"; priceRevision: string; knownSubtotalUsd: number;
  complete: boolean; attemptCount: number; unknownAttemptCount: number; missingUsageCount: number; missingPriceCount: number;
  calculationImpossibleCount: number; tokens: LlmUsageTokenTotals; groups: LlmUsageCostGroup[]; attempts: LlmUsageAttemptCost[] };
type LlmUsagePriceEntry = LlmUsagePriceTable["entries"][number];
function tokenTotals(attempts: readonly LlmUsageAttempt[]): LlmUsageTokenTotals {
  const sum = (key: "promptTokens" | "completionTokens" | "totalTokens" | "cachedTokens" | "reasoningTokens") => ({
    knownSubtotal: attempts.reduce((value, attempt) => value + (attempt[key] ?? 0), 0), unknownCount: attempts.filter((attempt) => attempt[key] === null).length });
  return { promptTokens: sum("promptTokens"), completionTokens: sum("completionTokens"), totalTokens: sum("totalTokens"), cachedTokens: sum("cachedTokens"), reasoningTokens: sum("reasoningTokens") };
}

function impossibleUsage(attempt: LlmUsageAttempt): boolean {
  return attempt.promptTokens !== null && attempt.cachedTokens !== null && attempt.cachedTokens > attempt.promptTokens ||
    attempt.completionTokens !== null && attempt.reasoningTokens !== null && attempt.reasoningTokens > attempt.completionTokens;
}

function inputCost(attempt: LlmUsageAttempt, price: LlmUsagePriceEntry | undefined): number | null {
  if (!price || attempt.promptTokens === null) return null;
  if (attempt.cachedTokens !== null) return ((attempt.promptTokens - attempt.cachedTokens) * price.inputUsdPerMillion + attempt.cachedTokens * price.cachedInputUsdPerMillion) / 1000000;
  return price.inputUsdPerMillion === price.cachedInputUsdPerMillion ? attempt.promptTokens * price.inputUsdPerMillion / 1000000 : null;
}

function outputCost(attempt: LlmUsageAttempt, price: LlmUsagePriceEntry | undefined): number | null {
  // Reported completion already includes reasoning; reasoning is never added a second time.
  return price && attempt.completionTokens !== null ? attempt.completionTokens * price.outputUsdPerMillion / 1000000 : null;
}

function calculateAttemptCost(attempt: LlmUsageAttempt, table: LlmUsagePriceTable): LlmUsageAttemptCost {
  const model = attempt.responseModel ?? attempt.requestedModel;
  const price = table.entries.find((entry) => entry.provider === attempt.provider && entry.model === model);
  const calculationImpossible = impossibleUsage(attempt);
  const missingUsage = attempt.promptTokens === null || attempt.completionTokens === null || attempt.cachedTokens === null;
  const pricedInput = calculationImpossible ? null : inputCost(attempt, price);
  const pricedOutput = calculationImpossible ? null : outputCost(attempt, price);
  return { id: attempt.id, provider: attempt.provider, model, role: attempt.role,
    knownCostUsd: pricedInput === null && pricedOutput === null ? null : (pricedInput ?? 0) + (pricedOutput ?? 0),
    complete: pricedInput !== null && pricedOutput !== null, missingUsage, missingPrice: !price,
    calculationImpossible };
}

function sameCostGroup(left: LlmUsageAttemptCost, right: LlmUsageAttemptCost): boolean {
  return left.provider === right.provider && left.model === right.model && left.role === right.role;
}

function groupCosts(costs: readonly LlmUsageAttemptCost[], attempts: readonly LlmUsageAttempt[]): LlmUsageCostGroup[] {
  const groups: LlmUsageCostGroup[] = [];
  for (const item of costs) {
    if (groups.some((group) => group.provider === item.provider && group.model === item.model && group.role === item.role)) continue;
    const groupedCosts = costs.filter((cost) => sameCostGroup(cost, item));
    const ids = new Set(groupedCosts.map((cost) => cost.id));
    groups.push({ provider: item.provider, model: item.model, role: item.role, attemptCount: groupedCosts.length,
      tokens: tokenTotals(attempts.filter((attempt) => ids.has(attempt.id))), knownSubtotalUsd: groupedCosts.reduce((total, cost) => total + (cost.knownCostUsd ?? 0), 0),
      unknownCostCount: groupedCosts.filter((cost) => !cost.complete).length });
  }
  return groups;
}

export function calculateLlmUsageCostReport(attempts: readonly LlmUsageAttempt[], supplied?: LlmUsagePriceTable): LlmUsageCostReport {
  const table = LlmUsagePriceTableSchema.parse(supplied ?? { revision: "unpriced", entries: [] });
  const costs = attempts.map((attempt) => calculateAttemptCost(attempt, table));
  const groups = groupCosts(costs, attempts);
  return { label: "estimated usage cost", priceRevision: table.revision, knownSubtotalUsd: costs.reduce((total, item) => total + (item.knownCostUsd ?? 0), 0),
    complete: costs.every((item) => item.complete), attemptCount: costs.length, unknownAttemptCount: costs.filter((item) => !item.complete).length,
    missingUsageCount: costs.filter((item) => item.missingUsage).length, missingPriceCount: costs.filter((item) => item.missingPrice).length,
    calculationImpossibleCount: costs.filter((item) => item.calculationImpossible).length, tokens: tokenTotals(attempts), groups, attempts: costs };
}
