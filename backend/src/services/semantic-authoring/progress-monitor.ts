import type { AdapterProgressObservationV1 } from "@kshiai/shared";

export type ProgressConditionV1 =
  | "continue"
  | "recovery_required"
  | "stalled_without_progress"
  | "repeated_state_cycle";

function observationsSinceProgress(
  observations: readonly AdapterProgressObservationV1[],
): readonly AdapterProgressObservationV1[] {
  let lastProgress = -1;
  for (let index = observations.length - 1; index >= 0; index -= 1) {
    if (observations[index].materialProgress) {
      lastProgress = index;
      break;
    }
  }
  return observations.slice(lastProgress + 1);
}

export function detectRepeatedStateCycle(
  observations: readonly AdapterProgressObservationV1[],
): boolean {
  const withoutProgress = observationsSinceProgress(observations);
  const lastSix = withoutProgress.slice(-6);
  const occurrences = new Map<string, number>();
  for (const observation of lastSix) {
    occurrences.set(
      observation.relevantStateDigest,
      (occurrences.get(observation.relevantStateDigest) ?? 0) + 1,
    );
  }
  if ([...occurrences.values()].some((count) => count >= 3)) {
    return true;
  }

  const lastFour = withoutProgress.slice(-4);
  return (
    lastFour.length === 4 &&
    lastFour[0].relevantStateDigest === lastFour[2].relevantStateDigest &&
    lastFour[1].relevantStateDigest === lastFour[3].relevantStateDigest &&
    lastFour[0].relevantStateDigest !== lastFour[1].relevantStateDigest
  );
}

export function classifyProgressCondition(
  observations: readonly AdapterProgressObservationV1[],
  recovery: Readonly<{
    strategyChanges: number;
    cycleRecoveryAlreadyUsed: boolean;
  }>,
): ProgressConditionV1 {
  const withoutProgress = observationsSinceProgress(observations);
  if (detectRepeatedStateCycle(observations)) {
    return recovery.cycleRecoveryAlreadyUsed || recovery.strategyChanges >= 2
      ? "repeated_state_cycle"
      : "recovery_required";
  }
  if (withoutProgress.length >= 7) {
    return "stalled_without_progress";
  }
  if (withoutProgress.length >= 4) {
    return "recovery_required";
  }
  return "continue";
}
