import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
  CharacterAttentionEffectivenessV1,
  CharacterFocusStateV1,
  TurnObservationPacket,
} from "./battle.js";
import {
  advanceCharacterFocusV1,
  CHARACTER_FOCUS_POLICY_V1,
} from "./character-focus-policy.js";
import { CHARACTER_FOCUS_V1_FIXTURES } from "./character-focus-policy.fixtures.js";
import type { ServerOnlyReserveCue } from "./perception.js";

const cueFor = (
  effectiveness: CharacterAttentionEffectivenessV1,
  side: "a" | "b" = "a",
): ServerOnlyReserveCue => ({
  side,
  targetEntityId: `character.${side}`,
  parameterKey: "focus",
  absoluteBand: effectiveness === "sharp" ? "full" : "taxed",
  relativeBand: effectiveness === "strained"
    ? "low"
    : effectiveness === "sharp" ? "full" : "ready",
});

describe("deterministic character focus policy V1", () => {
  it("passes the twelve frozen observer-relative scenarios at every focus band", () => {
    assert.equal(CHARACTER_FOCUS_V1_FIXTURES.length, 12);
    for (const fixture of CHARACTER_FOCUS_V1_FIXTURES) {
      for (const effectiveness of ["sharp", "steady", "strained"] as const) {
        const result = advanceCharacterFocusV1({
          observerSide: "a",
          turn: fixture.packet.turn,
          packet: fixture.packet,
          retainedPackets: fixture.retainedPackets,
          conversation: fixture.conversation,
          prior: fixture.prior,
          focusCue: cueFor(effectiveness),
          protectiveHold: fixture.protectiveHold,
        });
        assert.equal(
          result.state.primary?.kind ?? null,
          fixture.expected[effectiveness],
          `${fixture.id}:${effectiveness}`,
        );
        assert.equal(result.packet.primary?.kind ?? null, fixture.expected[effectiveness]);
        assert.equal(result.receipt.route, "deterministic_shadow_no_call");
        if (fixture.expectedReason) {
          assert.equal(result.receipt.reason, fixture.expectedReason, fixture.id);
        }
        if (fixture.hiddenCanonicalText) {
          assert.equal(JSON.stringify(result).includes(fixture.hiddenCanonicalText), false);
        }
      }
    }
  });

  it("is replay deterministic and does not score observation prose", () => {
    const fixture = CHARACTER_FOCUS_V1_FIXTURES.find((item) =>
      item.id === "fresh-counterpart-result"
    )!;
    const first = advanceCharacterFocusV1({
      observerSide: "a",
      turn: fixture.packet.turn,
      packet: fixture.packet,
      focusCue: cueFor("steady"),
    });
    const changedProse: TurnObservationPacket = {
      ...fixture.packet,
      counterpartResult: fixture.packet.counterpartResult.map((item) => ({
        ...item,
        phenomenon: "free text changed without changing structured evidence",
      })),
    };
    const second = advanceCharacterFocusV1({
      observerSide: "a",
      turn: changedProse.turn,
      packet: changedProse,
      focusCue: cueFor("steady"),
    });
    const replay = advanceCharacterFocusV1({
      observerSide: "a",
      turn: fixture.packet.turn,
      packet: fixture.packet,
      focusCue: cueFor("steady"),
    });

    assert.deepEqual(first, replay);
    assert.deepEqual(first.state, second.state);
    assert.deepEqual(first.receipt, second.receipt);
    assert.notEqual(first.packet.primary?.perceivedChange, second.packet.primary?.perceivedChange);
  });

  it("fails closed on missing or mismatched focus inputs", () => {
    const prior: CharacterFocusStateV1 = {
      schemaVersion: 1,
      policyGeneration: CHARACTER_FOCUS_POLICY_V1,
      primary: {
        kind: "self_result",
        evidenceRef: "focus.a.observation.1.self_result.0",
        salience: 600,
        strength: "clear",
        beganTurn: 1,
        lastEvidenceTurn: 1,
      },
      secondary: null,
      processedConversationThrough: null,
      transitionReason: "selected_fresh",
    };
    const missing = advanceCharacterFocusV1({
      observerSide: "a",
      turn: 2,
      prior,
      packet: null,
      focusCue: cueFor("steady"),
    });
    const mismatched = advanceCharacterFocusV1({
      observerSide: "a",
      turn: 2,
      prior,
      packet: {
        schemaVersion: 1,
        turn: 2,
        observerSide: "b",
        selfResult: [],
        counterpartResult: [],
        ambientChange: [],
      },
      focusCue: cueFor("steady"),
    });

    for (const result of [missing, mismatched]) {
      assert.equal(result.packet.primary, null);
      assert.equal(result.packet.effectiveness, null);
      assert.equal(result.receipt.reason, "feature_unavailable");
      assert.equal(result.receipt.selectedEvidenceRefs.length, 0);
      assert.ok((result.state.primary?.salience ?? 0) < 600);
    }
  });

  it("keeps structure symmetric when A and B labels are swapped", () => {
    const packetA: TurnObservationPacket = {
      schemaVersion: 1,
      turn: 4,
      observerSide: "a",
      selfResult: [],
      counterpartResult: [{
        phenomenon: "counterpart moved",
        certainty: "likely",
        sourceEventIds: ["event.move"],
      }],
      ambientChange: [],
    };
    const packetB: TurnObservationPacket = { ...packetA, observerSide: "b" };
    const a = advanceCharacterFocusV1({
      observerSide: "a",
      turn: 4,
      packet: packetA,
      focusCue: cueFor("steady", "a"),
    });
    const b = advanceCharacterFocusV1({
      observerSide: "b",
      turn: 4,
      packet: packetB,
      focusCue: cueFor("steady", "b"),
    });

    assert.equal(a.state.primary?.kind, b.state.primary?.kind);
    assert.equal(a.state.primary?.salience, b.state.primary?.salience);
    assert.equal(a.receipt.reason, b.receipt.reason);
    assert.equal(a.packet.primary?.perceivedChange, b.packet.primary?.perceivedChange);
    assert.deepEqual(
      a.receipt.selectedEvidenceRefs.map((ref) => ref.replace("focus.a.", "focus.side.")),
      b.receipt.selectedEvidenceRefs.map((ref) => ref.replace("focus.b.", "focus.side.")),
    );
  });

  it("uses high focus only for weak-cue detection and secondary capacity", () => {
    const fixture = CHARACTER_FOCUS_V1_FIXTURES.find((item) =>
      item.id === "competing-weak-and-strong-cues"
    )!;
    const sharp = advanceCharacterFocusV1({
      observerSide: "a",
      turn: fixture.packet.turn,
      packet: fixture.packet,
      focusCue: cueFor("sharp"),
    });
    const strained = advanceCharacterFocusV1({
      observerSide: "a",
      turn: fixture.packet.turn,
      packet: fixture.packet,
      focusCue: cueFor("strained"),
    });

    assert.equal(sharp.state.primary?.kind, strained.state.primary?.kind);
    assert.equal(sharp.state.secondary?.kind, "ambient_change");
    assert.equal(strained.state.secondary, null);
    assert.equal("quality" in sharp.packet, false);
    assert.equal("action" in sharp.packet, false);
  });
});
