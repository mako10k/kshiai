import {
  LOCAL_TWELVE_TURN_PACING_CANDIDATE,
  currentBattlePacingPolicy,
  measureBattlePacing,
} from "../packages/shared/src/index.js";

const sampleSize = 240;
const seed = 0x98_12_20;
console.log(JSON.stringify({
  schemaVersion: 1,
  kind: "deterministic_local_pacing_measurement",
  sampleSize,
  seed,
  current: measureBattlePacing({
    policy: currentBattlePacingPolicy(20),
    sampleSize,
    seed,
  }),
  candidate: measureBattlePacing({
    policy: LOCAL_TWELVE_TURN_PACING_CANDIDATE,
    sampleSize,
    seed,
  }),
}, null, 2));
