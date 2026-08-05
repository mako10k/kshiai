import type { TurnEvent } from "./battle.js";
import {
  readBattleWorldPair,
  type BattleWorldState,
  type WorldDistance,
  type WorldOrientation,
} from "./battle-world.js";
import { deriveBattleActorCausality } from "./battle-causality.js";
import {
  type BattleSide,
  type CharacterPerceptionFrame,
  type CurrentAccess,
  type IdentityKnowledge,
  type PerceptionAccess,
  type PerceptionDirection,
  type PerceptionDistance,
  type PerceptionEvidence,
} from "./perception.js";

export type CharacterExpressionSource = Readonly<{
  side: BattleSide;
  speaker: string;
  text: string;
  delivery: "spoken" | "visible_reaction";
  volume?: "quiet" | "normal" | "loud";
  language?: string;
}>;

/**
 * Commits only expressions the speaker can physically produce. These events are
 * server-private facts; public narration is never accepted by this boundary.
 */
export function buildCommittedUtteranceEvents(input: {
  turn: number;
  sources: readonly CharacterExpressionSource[];
  worldState?: BattleWorldState;
  scope?: "aftermath";
}): TurnEvent[] {
  return [...input.sources]
    .sort((a, b) => a.side.localeCompare(b.side))
    .flatMap((source) => {
      const actor = input.worldState?.entities[`character.${source.side}`];
      const actorState = deriveBattleActorCausality({
        worldState: input.worldState,
        actorSide: source.side,
      }).effectiveActorState ?? actor?.actorState;
      const responsive = !input.worldState || Boolean(
        actor?.active &&
        actor.presence === "present" &&
        actorState &&
        actorState.consciousness !== "unconscious" &&
        actorState.consciousness !== "incapacitated",
      );
      const canSpeak = responsive && (
        source.delivery !== "spoken" ||
        !actorState ||
        !["blocked", "absent"].includes(actorState.speech ?? "normal")
      );
      const text = source.text.trim().slice(0, 400);
      if (!canSpeak || !text) return [];
      const articulation = actorState?.speech === "impaired"
        ? "impaired" as const
        : "clear" as const;
      return [{
        id: input.scope
          ? `event.utterance.${input.turn}.${input.scope}.${source.side}`
          : `event.utterance.${input.turn}.${source.side}`,
        type: "utterance" as const,
        actorName: source.speaker,
        actorSide: source.side,
        utterance: {
          text,
          delivery: source.delivery,
          volume: source.volume ?? (articulation === "impaired" ? "quiet" : "normal"),
          articulation,
          language: source.language?.trim().slice(0, 40) || "shared",
        },
        summary: source.delivery === "spoken"
          ? `${source.speaker}が発話した。`
          : `${source.speaker}が反応を示した。`,
      } satisfies TurnEvent];
    });
}

/** Deterministically projects committed expressions without using public text. */
export function buildUtterancePerceptionEvidence(input: {
  events: readonly TurnEvent[];
  worldState?: BattleWorldState;
  previousFrameA?: CharacterPerceptionFrame;
  previousFrameB?: CharacterPerceptionFrame;
}): PerceptionEvidence[] {
  return input.events.flatMap((event) => {
    if (
      event.type !== "utterance" ||
      !event.id ||
      !event.actorSide ||
      !event.utterance
    ) {
      return [];
    }
    const actorSide = event.actorSide;
    const accessBySide = {
      a: expressionAccess({
        observerSide: "a",
        event,
        actorSide,
        worldState: input.worldState,
        previousFrame: input.previousFrameA,
      }),
      b: expressionAccess({
        observerSide: "b",
        event,
        actorSide,
        worldState: input.worldState,
        previousFrame: input.previousFrameB,
      }),
    };
    const publicText = event.utterance.delivery === "spoken"
      ? `「${event.utterance.text}」と発話した`
      : event.utterance.text;
    return [{
      evidenceId: `evidence.utterance.${event.id.replace(/^event\./, "")}`,
      basisEventIds: [event.id],
      modality: event.utterance.delivery === "spoken" ? "sound" : "vision",
      phenomenon: publicText,
      source: {
        kind: "entity",
        entityId: `character.${actorSide}`,
      },
      accessBySide,
      publicAccess: {
        currentAccess: "clear",
        identityKnowledge: "identified",
        perceivedAs: event.actorName || `side ${event.actorSide}`,
        direction: "unknown",
        distance: "unknown",
        occurrenceCertainty: "certain",
        attributionCertainty: "certain",
      },
    } satisfies PerceptionEvidence];
  });
}

function expressionAccess(input: {
  observerSide: BattleSide;
  event: TurnEvent;
  actorSide: BattleSide;
  worldState?: BattleWorldState;
  previousFrame?: CharacterPerceptionFrame;
}): PerceptionAccess {
  const utterance = input.event.utterance!;
  if (input.observerSide === input.actorSide) {
    return {
      currentAccess: "clear",
      identityKnowledge: "identified",
      perceivedAs: "自分自身",
      perceivedPhenomenon: utterance.delivery === "spoken"
        ? `自分が「${utterance.text}」と発話した`
        : utterance.text,
      direction: "unknown",
      distance: "contact",
      occurrenceCertainty: "certain",
      attributionCertainty: "certain",
    };
  }
  if (utterance.delivery === "visible_reaction") {
    const currentAccess = input.previousFrame?.counterpart.currentAccess ?? "none";
    const identityKnowledge = input.previousFrame?.counterpart.identityKnowledge ??
      "unknown";
    return {
      currentAccess,
      identityKnowledge,
      perceivedAs: perceivedSpeakerLabel(input, identityKnowledge, currentAccess),
      perceivedPhenomenon: currentAccess === "none"
        ? "相手の反応は見えない"
        : utterance.text,
      direction: counterpartDirection(input),
      distance: counterpartDistance(input),
      occurrenceCertainty: currentAccess === "none" ? "unknown" : "certain",
      attributionCertainty: attributionFor(identityKnowledge, currentAccess),
    };
  }
  return spokenAccess(input);
}

function spokenAccess(input: {
  observerSide: BattleSide;
  event: TurnEvent;
  actorSide: BattleSide;
  worldState?: BattleWorldState;
  previousFrame?: CharacterPerceptionFrame;
}): PerceptionAccess {
  const utterance = input.event.utterance!;
  const observerId = `character.${input.observerSide}`;
  const speakerId = `character.${input.actorSide}`;
  const observer = input.worldState?.entities[observerId];
  const speaker = input.worldState?.entities[speakerId];
  const observerState = deriveBattleActorCausality({
    worldState: input.worldState,
    actorSide: input.observerSide,
  }).effectiveActorState ?? observer?.actorState;
  const pair = input.worldState
    ? readBattleWorldPair(input.worldState, observerId, speakerId)
    : null;
  const unavailable = Boolean(input.worldState) && (
    !observer || !speaker || !pair ||
    !observer.active || observer.presence === "absent" ||
    !speaker.active || speaker.presence === "absent" ||
    !observerState ||
    observerState.consciousness === "unconscious" ||
    observerState.consciousness === "incapacitated" ||
    observerState.hearing === "blocked" ||
    observerState.hearing === "absent" ||
    pair?.sound === "blocked" ||
    pair?.distance === "out_of_scene"
  );
  let currentAccess: CurrentAccess = unavailable ? "none" : "clear";
  if (!unavailable && input.worldState && observer && pair && observerState) {
    let penalty = 0;
    if (pair.sound === "partial") penalty += 1;
    if (pair.distance === "medium") penalty += 1;
    if (pair.distance === "far" || pair.distance === "separate_area") penalty += 2;
    if (observerState.hearing === "impaired") penalty += 1;
    if (observerState.mentalClarity === "confused") penalty += 1;
    if (observerState.mentalClarity === "delirious") penalty += 2;
    if (utterance.articulation === "impaired") penalty += 1;
    if (utterance.volume === "quiet") penalty += 1;
    if (utterance.volume === "loud") penalty -= 1;
    if (observer.placement.type === "scene") {
      const noise = input.worldState.areas[observer.placement.areaId]?.noise;
      if (noise === "loud") penalty += 1;
      if (noise === "overwhelming") penalty += 2;
    }
    currentAccess = penalty <= 0
      ? "clear"
      : penalty === 1
        ? "coarse"
        : penalty === 2
          ? "trace"
          : "none";
  }
  const priorIdentity = input.previousFrame?.counterpart.identityKnowledge ??
    "unknown";
  const continuity = input.previousFrame?.counterpart.apparentIdentity
    ?.continuity;
  const linkedToRememberedIdentity = continuity === undefined ||
    continuity === "same_entity";
  const visuallyLinked = ["coarse", "clear"].includes(
    input.previousFrame?.counterpart.currentAccess ?? "none",
  );
  const identityKnowledge: IdentityKnowledge =
    priorIdentity === "identified" && linkedToRememberedIdentity
    ? "identified"
    : visuallyLinked && currentAccess !== "none"
      ? "suspected"
      : priorIdentity;
  const understanding = observerState?.languageUnderstanding ?? "fluent";
  return {
    currentAccess,
    identityKnowledge,
    perceivedAs: perceivedSpeakerLabel(input, identityKnowledge, currentAccess),
    perceivedPhenomenon: heardPhenomenon({
      text: utterance.text,
      currentAccess,
      understanding,
      articulation: utterance.articulation,
    }),
    direction: pair ? orientationDirection(pair.orientationA) : "unknown",
    distance: pair ? worldDistanceToPerception(pair.distance) : "unknown",
    occurrenceCertainty: currentAccess === "none"
      ? "unknown"
      : currentAccess === "trace"
        ? "probable"
        : "certain",
    attributionCertainty: attributionFor(identityKnowledge, currentAccess),
  };
}

function heardPhenomenon(input: {
  text: string;
  currentAccess: CurrentAccess;
  understanding: "fluent" | "partial" | "none";
  articulation: "clear" | "impaired";
}): string {
  if (input.currentAccess === "none") return "発話は聞こえない";
  if (input.currentAccess === "trace") return "途切れた声だけが聞こえる";
  if (input.understanding === "none") {
    return "発話は聞こえるが、言葉の意味は分からない";
  }
  if (
    input.currentAccess === "coarse" ||
    input.understanding === "partial" ||
    input.articulation === "impaired"
  ) {
    return `「${partialSpeechText(input.text)}」まで聞き取れる`;
  }
  return `「${input.text}」と聞こえる`;
}

function partialSpeechText(text: string): string {
  const characters = [...text.trim()];
  if (characters.length <= 2) return `${characters[0] ?? ""}…`;
  const retained = Math.max(1, Math.min(12, Math.ceil(characters.length / 3)));
  return `${characters.slice(0, retained).join("")}…`;
}

function perceivedSpeakerLabel(input: {
  event: TurnEvent;
}, identity: IdentityKnowledge, access: CurrentAccess): string {
  if (access === "none") return "聞き取れない相手";
  if (identity === "identified") return input.event.actorName || "知っている相手";
  if (identity === "suspected") return "対峙する相手らしい声の主";
  return "正体不明の声の主";
}

function attributionFor(
  identity: IdentityKnowledge,
  access: CurrentAccess,
): "unknown" | "possible" | "probable" | "certain" {
  if (access === "none") return "unknown";
  if (identity === "identified" && access === "clear") return "certain";
  if (identity !== "unknown" && access !== "trace") return "probable";
  return "possible";
}

function counterpartDirection(input: {
  observerSide: BattleSide;
  event: TurnEvent;
  actorSide: BattleSide;
  worldState?: BattleWorldState;
}): PerceptionDirection {
  if (!input.worldState) return "unknown";
  const pair = readBattleWorldPair(
    input.worldState,
    `character.${input.observerSide}`,
    `character.${input.actorSide}`,
  );
  return pair ? orientationDirection(pair.orientationA) : "unknown";
}

function counterpartDistance(input: {
  observerSide: BattleSide;
  event: TurnEvent;
  actorSide: BattleSide;
  worldState?: BattleWorldState;
}): PerceptionDistance {
  if (!input.worldState) return "unknown";
  const pair = readBattleWorldPair(
    input.worldState,
    `character.${input.observerSide}`,
    `character.${input.actorSide}`,
  );
  return pair ? worldDistanceToPerception(pair.distance) : "unknown";
}

function worldDistanceToPerception(
  distance: WorldDistance,
): PerceptionDistance {
  if (distance === "contact") return "contact";
  if (distance === "near") return "near";
  if (distance === "medium") return "mid";
  if (distance === "far") return "far";
  return "unknown";
}

function orientationDirection(
  orientation: WorldOrientation,
): PerceptionDirection {
  if (orientation === "facing") return "front";
  if (orientation === "away") return "back";
  return "unknown";
}
