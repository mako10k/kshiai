// R: Derive and validate the HTTP advance bound for normal awareness observations.
import { AwarenessNormalPolicy } from "@kshiai/shared";

export const NORMAL_OBSERVATION_ADVANCE_LIMIT = AwarenessNormalPolicy.maxTicks + 2;

export function parseNormalObservationAdvances(raw: string | undefined): number {
  const value = Number(raw ?? NORMAL_OBSERVATION_ADVANCE_LIMIT);
  if (!Number.isInteger(value) || value < 1 || value > NORMAL_OBSERVATION_ADVANCE_LIMIT) {
    throw new Error(`E2E_MAX_ADVANCES must be an integer from 1 through ${NORMAL_OBSERVATION_ADVANCE_LIMIT}`);
  }
  return value;
}
