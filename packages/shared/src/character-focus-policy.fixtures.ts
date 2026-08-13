import type {
  CharacterConversationEntry,
  CharacterFocusEvidenceKindV1,
  CharacterFocusStateV1,
  TurnObservationPacket,
} from "./battle.js";
import { CHARACTER_FOCUS_POLICY_V1 } from "./character-focus-policy.js";

export type CharacterFocusFixtureExpectationV1 = {
  sharp: CharacterFocusEvidenceKindV1 | null;
  steady: CharacterFocusEvidenceKindV1 | null;
  strained: CharacterFocusEvidenceKindV1 | null;
};

export type CharacterFocusFixtureV1 = {
  id: string;
  description: string;
  packet: TurnObservationPacket;
  retainedPackets?: TurnObservationPacket[];
  conversation?: CharacterConversationEntry[];
  prior?: CharacterFocusStateV1;
  protectiveHold?: boolean;
  hiddenCanonicalText?: string;
  expected: CharacterFocusFixtureExpectationV1;
  expectedReason?: CharacterFocusStateV1["transitionReason"];
};

const emptyPacket = (turn: number): TurnObservationPacket => ({
  schemaVersion: 1,
  turn,
  observerSide: "a",
  selfResult: [],
  counterpartResult: [],
  ambientChange: [],
});

const retainedCounterpartPacket: TurnObservationPacket = {
  ...emptyPacket(2),
  counterpartResult: [{
    phenomenon: "相手が守る位置を変えた。",
    certainty: "certain",
    sourceEventIds: ["event.retained"],
  }],
};

const retainedCounterpartFocus: CharacterFocusStateV1 = {
  schemaVersion: 1,
  policyGeneration: CHARACTER_FOCUS_POLICY_V1,
  primary: {
    kind: "counterpart_result",
    evidenceRef: "focus.a.observation.2.counterpart_result.0",
    salience: 820,
    strength: "strong",
    beganTurn: 2,
    lastEvidenceTurn: 2,
  },
  secondary: null,
  processedConversationThrough: 2,
  transitionReason: "selected_fresh",
};

export const CHARACTER_FOCUS_V1_FIXTURES: readonly CharacterFocusFixtureV1[] = [
  {
    id: "subtle-counterpart-gesture",
    description: "weak fresh interpersonal cue",
    packet: {
      ...emptyPacket(3),
      counterpartResult: [{
        phenomenon: "相手の視線が一瞬だけ出口へ動いた。",
        certainty: "uncertain",
        sourceEventIds: ["event.gesture"],
      }],
    },
    expected: { sharp: "counterpart_result", steady: "counterpart_result", strained: null },
  },
  {
    id: "direct-counterpart-reply",
    description: "strong fresh speech cue",
    packet: emptyPacket(3),
    conversation: [{ turn: 2, speaker: "counterpart", text: "その構えでは届かない。" }],
    prior: {
      ...retainedCounterpartFocus,
      primary: null,
      processedConversationThrough: 1,
    },
    expected: { sharp: "counterpart_speech", steady: "counterpart_speech", strained: "counterpart_speech" },
  },
  {
    id: "fresh-self-result",
    description: "own immediate committed consequence",
    packet: {
      ...emptyPacket(3),
      selfResult: [{
        phenomenon: "自分の足取りがわずかに重くなった。",
        certainty: "likely",
        sourceEventIds: ["event.self"],
      }],
    },
    expected: { sharp: "self_result", steady: "self_result", strained: null },
  },
  {
    id: "fresh-counterpart-result",
    description: "observed change to the counterpart",
    packet: {
      ...emptyPacket(3),
      counterpartResult: [{
        phenomenon: "相手の武器が手から離れた。",
        certainty: "certain",
        sourceEventIds: ["event.drop"],
      }],
    },
    expected: { sharp: "counterpart_result", steady: "counterpart_result", strained: "counterpart_result" },
  },
  {
    id: "ambient-microchange",
    description: "small relevant environmental cue",
    packet: {
      ...emptyPacket(3),
      ambientChange: [{
        phenomenon: "床の砂がかすかに流れた。",
        certainty: "uncertain",
        sourceEventIds: ["event.sand"],
      }],
    },
    expected: { sharp: "ambient_change", steady: null, strained: null },
  },
  {
    id: "strong-ambient-interruption",
    description: "strong cue may legitimately switch focus",
    packet: {
      ...emptyPacket(3),
      ambientChange: [{
        phenomenon: "足場全体が崩れ始めた。",
        certainty: "certain",
        sourceEventIds: ["event.floor.1", "event.floor.2", "event.floor.3"],
      }],
    },
    retainedPackets: [retainedCounterpartPacket],
    prior: retainedCounterpartFocus,
    expected: { sharp: "ambient_change", steady: "ambient_change", strained: "ambient_change" },
    expectedReason: "switched_stronger",
  },
  {
    id: "no-new-evidence",
    description: "prior focus decays without fabricated freshness",
    packet: emptyPacket(3),
    retainedPackets: [retainedCounterpartPacket],
    prior: retainedCounterpartFocus,
    expected: { sharp: "counterpart_result", steady: "counterpart_result", strained: "counterpart_result" },
    expectedReason: "decayed_unsupported",
  },
  {
    id: "repeated-self-utterance-only",
    description: "self echo is not fresh evidence",
    packet: emptyPacket(3),
    conversation: [{ turn: 2, speaker: "self", text: "まだ終わらない。" }],
    expected: { sharp: null, steady: null, strained: null },
    expectedReason: "no_detectable_evidence",
  },
  {
    id: "counterpart-responds-to-repeat",
    description: "a new counterpart response may refresh focus",
    packet: emptyPacket(3),
    conversation: [
      { turn: 2, speaker: "self", text: "まだ終わらない。" },
      { turn: 2, speaker: "counterpart", text: "なら、立ってみせろ。" },
    ],
    expected: { sharp: "counterpart_speech", steady: "counterpart_speech", strained: "counterpart_speech" },
  },
  {
    id: "competing-weak-and-strong-cues",
    description: "stronger relevant evidence wins",
    packet: {
      ...emptyPacket(3),
      counterpartResult: [{
        phenomenon: "相手が明確に間合いを詰めた。",
        certainty: "certain",
        sourceEventIds: ["event.advance"],
      }],
      ambientChange: [{
        phenomenon: "遠くで小石が転がった。",
        certainty: "uncertain",
        sourceEventIds: ["event.pebble"],
      }],
    },
    expected: { sharp: "counterpart_result", steady: "counterpart_result", strained: "counterpart_result" },
  },
  {
    id: "deliberate-protective-hold",
    description: "character-grounded fixation persists without new evidence",
    packet: emptyPacket(3),
    retainedPackets: [retainedCounterpartPacket],
    prior: retainedCounterpartFocus,
    protectiveHold: true,
    expected: { sharp: "counterpart_result", steady: "counterpart_result", strained: "counterpart_result" },
    expectedReason: "held_protective",
  },
  {
    id: "hidden-canonical-change",
    description: "unperceived information never becomes a candidate",
    packet: emptyPacket(3),
    hiddenCanonicalText: "相手の非公開状態では罠が起動している。",
    expected: { sharp: null, steady: null, strained: null },
    expectedReason: "no_detectable_evidence",
  },
] as const;
