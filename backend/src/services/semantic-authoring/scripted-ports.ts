import type {
  SemanticAuthoringReservationV1,
  SemanticAuthoringRunV1,
} from "@kshiai/shared";
import { admitSemanticAuthoringReservation } from "./accounting.js";
import type {
  SemanticAuthoringFencePortV1,
  SemanticAuthoringPortsV1,
  SemanticAuthoringProviderPortV1,
} from "./ports.js";

type DispatchedRequestV1 = Readonly<{
  reservation: SemanticAuthoringReservationV1;
  dispatchedAtMs: number;
  abandoned: boolean;
}>;

export type ScriptedSemanticAuthoringPortsV1 = SemanticAuthoringPortsV1 & Readonly<{
  advanceMs(ms: number): void;
  replaceFence(fence: SemanticAuthoringRunV1["executionFence"]): void;
}>;

export function createScriptedSemanticAuthoringPortsV1(
  initial: Readonly<{
    nowMs: number;
    fence: SemanticAuthoringRunV1["executionFence"];
  }>,
): ScriptedSemanticAuthoringPortsV1 {
  let nowMs = initial.nowMs;
  let fence = initial.fence;
  const requests = new Map<string, DispatchedRequestV1>();

  const provider: SemanticAuthoringProviderPortV1 = {
    recordDispatch(reservation, dispatchedAtMs) {
      requests.set(reservation.requestId, {
        reservation,
        dispatchedAtMs,
        abandoned: false,
      });
    },
    dispatchedAtMs(requestId) {
      const request = requests.get(requestId);
      return request && !request.abandoned ? request.dispatchedAtMs : null;
    },
    abandon(requestId) {
      const request = requests.get(requestId);
      if (request) {
        requests.set(requestId, { ...request, abandoned: true });
      }
    },
  };

  const fencePort: SemanticAuthoringFencePortV1 = {
    owns(current) {
      return (
        current.ownerId === fence.ownerId &&
        current.fencingToken === fence.fencingToken &&
        current.runVersion === fence.runVersion
      );
    },
  };

  return {
    clock: {
      nowMs() {
        return nowMs;
      },
    },
    accounting: {
      admit: admitSemanticAuthoringReservation,
    },
    provider,
    fence: fencePort,
    advanceMs(ms) {
      nowMs += ms;
    },
    replaceFence(next) {
      fence = next;
    },
  };
}
