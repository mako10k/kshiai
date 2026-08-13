import { createHash } from "node:crypto";
import {
  advanceCharacterFocusV1,
  CHARACTER_FOCUS_POLICY_V1,
} from "../packages/shared/src/character-focus-policy.js";
import { CHARACTER_FOCUS_V1_FIXTURES } from
  "../packages/shared/src/character-focus-policy.fixtures.js";
import type { CharacterAttentionEffectivenessV1 } from
  "../packages/shared/src/battle.js";
import type { ServerOnlyReserveCue } from
  "../packages/shared/src/perception.js";

const effectivenessBands = ["sharp", "steady", "strained"] as const;

function focusCue(
  effectiveness: CharacterAttentionEffectivenessV1,
): ServerOnlyReserveCue {
  return {
    side: "a",
    targetEntityId: "character.a",
    parameterKey: "focus",
    absoluteBand: effectiveness === "sharp" ? "full" : "taxed",
    relativeBand: effectiveness === "strained"
      ? "low"
      : effectiveness === "sharp" ? "full" : "ready",
  };
}

const results = CHARACTER_FOCUS_V1_FIXTURES.flatMap((fixture) =>
  effectivenessBands.map((effectiveness) => {
    const first = advanceCharacterFocusV1({
      observerSide: "a",
      turn: fixture.packet.turn,
      prior: fixture.prior,
      packet: fixture.packet,
      retainedPackets: fixture.retainedPackets,
      conversation: fixture.conversation,
      focusCue: focusCue(effectiveness),
      protectiveHold: fixture.protectiveHold,
    });
    const replay = advanceCharacterFocusV1({
      observerSide: "a",
      turn: fixture.packet.turn,
      prior: fixture.prior,
      packet: fixture.packet,
      retainedPackets: fixture.retainedPackets,
      conversation: fixture.conversation,
      focusCue: focusCue(effectiveness),
      protectiveHold: fixture.protectiveHold,
    });
    const expectedKind = fixture.expected[effectiveness];
    return {
      fixture: fixture.id,
      effectiveness,
      expectedKind,
      selectedKind: first.state.primary?.kind ?? null,
      reason: first.receipt.reason,
      replayMatch: JSON.stringify(first) === JSON.stringify(replay),
      hiddenTextSelected: fixture.hiddenCanonicalText
        ? JSON.stringify(first).includes(fixture.hiddenCanonicalText)
        : false,
    };
  })
);

const failures = results.filter((result) =>
  result.selectedKind !== result.expectedKind ||
  !result.replayMatch ||
  result.hiddenTextSelected
);
const fixtureDigest = createHash("sha256")
  .update(JSON.stringify(CHARACTER_FOCUS_V1_FIXTURES))
  .digest("hex");
const selfEchoSelections = results.filter((result) =>
  result.fixture === "repeated-self-utterance-only" &&
  result.selectedKind !== null
).length;

console.log(JSON.stringify({
  schemaVersion: 1,
  policyGeneration: CHARACTER_FOCUS_POLICY_V1,
  fixtureDigest,
  fixtureCount: CHARACTER_FOCUS_V1_FIXTURES.length,
  evaluatedCases: results.length,
  failures: failures.length,
  replayMismatches: results.filter((result) => !result.replayMatch).length,
  hiddenTextSelections: results.filter((result) => result.hiddenTextSelected).length,
  repeatedSelfUtteranceSelections: selfEchoSelections,
  providerCalls: 0,
  results,
}, null, 2));

if (failures.length > 0 || selfEchoSelections > 0) process.exitCode = 1;
