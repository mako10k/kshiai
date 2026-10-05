// R: Bind awareness execution storage operations to the durable sidecar repository.
import {
  completeAwarenessConsciousJob, getAwarenessRuntime, mutateAwarenessRuntime,
  reserveAwarenessAttempt, settleAwarenessAttempt,
} from "../repositories/battle-awareness.js";
import type { AwarenessExecutionStorage } from "./awareness-execution.js";

export const awarenessExecutionStorage: AwarenessExecutionStorage = {
  async read(battleId) {
    const snapshot = await getAwarenessRuntime(battleId);
    if (!snapshot) throw new Error("AWARENESS_RUNTIME_NOT_FOUND");
    return snapshot;
  },
  update: mutateAwarenessRuntime,
  reserve: reserveAwarenessAttempt,
  settle: settleAwarenessAttempt,
  completeThought: completeAwarenessConsciousJob,
};
