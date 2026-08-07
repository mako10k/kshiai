import {
  PerceptionEvidenceSetSchema,
  TurnSemanticPatchSchema,
  type BattleSemanticState,
  type EnvironmentProcessProposal,
  type PerceptionEvidence,
  type ResolvedBattleAction,
  type TurnEvent,
  type TurnSemanticPatch,
} from "@kshiai/shared";

// The topology fixture matrix remains v10: this slice adds fields to the same
// reviewed single combined call without changing the combined/split topology.
export const PERCEPTION_PROMPT_FIXTURE_VERSION = "perception-prompts-v10";

export const PERCEPTION_PROMPT_QUALITY_FLOORS = {
  minimumSamples: 9,
  worldSchemaValidRate: 0.98,
  sensorySchemaValidRate: 0.98,
  worldPatchCorrectness: 0.95,
  sensoryCoverage: 0.9,
  maximumAttributionErrorRate: 0.02,
  maximumIdentityLeakageRate: 0,
} as const;

export type PerceptionPromptTopology = "combined" | "split";

export type PerceptionPromptResponseFormat = {
  type: "json_schema";
  json_schema: {
    name: string;
    strict: true;
    schema: Record<string, unknown>;
  };
};

export type PerceptionPromptInput = {
  turn: number;
  before: BattleSemanticState;
  actions: ResolvedBattleAction[];
  events: TurnEvent[];
  battlefield: {
    displayName: string;
    terrain: string;
    obstacles: string[];
    conditions: string[];
  } | null;
  characters: {
    a: PerceptionPromptCharacter;
    b: PerceptionPromptCharacter;
  };
  environmentBeatDue: boolean;
  environmentProposal: EnvironmentProcessProposal | null;
  dramaPhase: "opening" | "rising" | "climax";
  mechanicalEvidence: Array<{
    eventId: string;
    kind: "impact" | "exertion" | "recovery" | "no_effect";
    actorSide: "a" | "b" | null;
    targetSides: Array<"a" | "b">;
    parameterClass: "vitality" | "stamina" | "focus" | "other";
    direction: "loss" | "gain" | "unchanged";
    absoluteBand: "none" | "trace" | "light" | "solid" | "heavy" | "extreme";
    relativeBand: "none" | "trace" | "light" | "solid" | "heavy" | "extreme" | "not_applicable";
    outcome: "none" | "effective" | "immune" | "incapacitated" | "overkill";
    handFeelRequired: boolean;
  }>;
};

type PerceptionPromptCharacter = {
  displayName: string;
  appearanceSummary: string;
  traits: string[];
  basicAttack: { name: string; description: string };
  skills: Array<{ id: string; name: string; description: string }>;
};

type ExpectedPerceptionAccess = {
  currentAccess: Array<
    PerceptionEvidence["accessBySide"]["a"]["currentAccess"]
  >;
  identityKnowledge: Array<
    PerceptionEvidence["accessBySide"]["a"]["identityKnowledge"]
  >;
};

export type PerceptionPromptFixture = {
  id: string;
  description: string;
  input: PerceptionPromptInput;
  expectedPatch: TurnSemanticPatch;
  expectedSensoryEvidence: PerceptionEvidence[];
  sensoryRequirements: Array<{
    acceptedModalities: PerceptionEvidence["modality"][];
    acceptedSourceKeys: string[];
    expectedAccessBySide: {
      a: ExpectedPerceptionAccess;
      b: ExpectedPerceptionAccess;
    };
  }>;
  forbiddenIdentityTermsBySide: {
    a: string[];
    b: string[];
  };
};

export type PromptCallMeasurement = {
  latencyMs: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
};

export type PerceptionPromptCandidate = {
  fixtureId: string;
  topology: PerceptionPromptTopology;
  rawWorldResponse: unknown;
  rawSensoryResponse?: unknown;
  calls: PromptCallMeasurement[];
};

export type PerceptionPromptSampleScore = {
  fixtureId: string;
  topology: PerceptionPromptTopology;
  worldSchemaValid: boolean;
  sensorySchemaValid: boolean;
  worldPatchCorrectness: number;
  sensoryCoverage: number;
  attributionErrors: number;
  attributionChecks: number;
  identityLeakages: number;
  identityLeakageChecks: number;
  latencyMs: number;
  totalTokens: number | null;
  observedWorldOperations: Array<{ op: string; path: string }>;
  observedSensoryCues: Array<{
    modality: string;
    sourceKind: string;
    sourceKey: string;
    accessA: string;
    identityA: string;
    accessB: string;
    identityB: string;
  }>;
  worldSchemaIssues: string[];
  sensorySchemaIssues: string[];
};

export type PerceptionPromptAggregate = {
  fixtureVersion: string;
  topology: PerceptionPromptTopology;
  sampleCount: number;
  worldSchemaValidRate: number;
  sensorySchemaValidRate: number;
  worldPatchCorrectness: number;
  sensoryCoverage: number;
  attributionErrorRate: number;
  identityLeakageRate: number;
  meanLatencyMs: number;
  p95LatencyMs: number;
  measuredTokenSamples: number;
  meanTotalTokens: number | null;
  totalTokens: number | null;
};

export type PerceptionPromptRecommendation = {
  topology: PerceptionPromptTopology | null;
  reason:
    | "combined_meets_quality_floor"
    | "combined_below_floor_split_meets_floor"
    | "insufficient_samples"
    | "no_topology_meets_quality_floor";
  combinedFailures: string[];
  splitFailures: string[];
};

export const WORLD_RECONCILIATION_SYSTEM_PROMPT = `Reconcile one already-resolved fictional confrontation turn into observable semantic-state changes.
The deterministic engine has already committed actions, events, resource changes, incapacity, and winner state. Never invent or alter those mechanics.
Return JSON only:
{
  "patch": {
    "operations": [
      { "op": "add"|"replace"|"remove", "path": JSON_POINTER, "value"?: JSON_VALUE }
    ]
  },
  "nextSituation": null | {
    "notes": string,
    "tags": string[],
    "coefficients": { [allowed_key: string]: number }
  },
  "environmentDecision": null | {
    "status": "accepted"|"rejected",
    "reason": string
  }
}
Patch only /scene/summary, /scene/facts leaves, or /entities entries and their label/location/active/facts/visibleTo.
Use existing entity ids and fact keys whenever possible. Create a stable ASCII entity id only for a newly created persistent object or effect.
Picking something up changes its location to {"type":"held","side":"a"|"b"}; do not delete it.
Broken, consumed, destroyed, or removed entities remain tombstoned through active/location/facts. Create debris or other persistent results as entities when materially relevant.
Character-visible changes belong under /entities/character.a/facts or /entities/character.b/facts. Never write private thoughts.
When a committed event durably changes a character's visible form, keep canonical label and identity unchanged. Patch appearance_changes leaves only: current_form or current_form_by_side, apparent_identity or apparent_identity_by_side, witnessed_by, confidence or confidence_by_side, and continuity or continuity_by_side. continuity is same_entity, possibly_same_entity, or unlinked. A hallucination is observer-local sensory evidence, never a canonical entity or canonical identity change.
Entities are visible to both sides by default. Set optional visibleTo to ["a"] or ["b"] only when the entity as a whole is not observable by the other side; the deterministic engine performs projection from this field and never infers visibility from prose. Required character entities always remain visible to both.
Do not patch schemaVersion, revision, createdTurn, updatedTurn, combat parameters, action legality, winner state, or private agent state.
If no durable observable change occurred, return an empty operations array.
Do not restate the scene summary or persist a transient attack, impact, damage, recovery, action, or sensory occurrence. Those already exist as committed events.
Never infer or patch winner, incapacity, active=false, damage/status facts, or visible_conditions from event wording. The deterministic engine owns those results.
When an event changes no persistent entity, location, object condition, terrain, weather, or other durable world fact, operations must remain empty.
Do not add character facts that duplicate an entity location, held object, action, opponent relation, or committed event.
Examples: an impact with no durable world alteration returns []; unidentified footsteps with no durable world alteration returns []; picking up an existing object returns only the object's location replacement and no character fact or scene-summary restatement.
environmentProposal is non-authoritative supervisor noise, not a committed event. When it is null, environmentDecision must be null and environmentBeatDue alone does not authorize a new environmental fact. When it is present, compare it with worldBefore and the battlefield. Accept it only when its cause is grounded and its result can be expressed as a durable world transition: add one non-character environment entity, or change an existing non-character entity's location or active state. Grounding does not require the proposed result to already exist in input events: a cause present in worldBefore or the battlefield is enough to consider, and acceptance plus its canonical operation commit the result atomically. Scene prose or entity facts alone are not enough to accept it. On acceptance, set environmentDecision.status to accepted and include the corresponding qualifying operation in the same response; never return accepted with an empty or unrelated operations array. Optionally provide bounded nextSituation values for the following turn. On rejection, set environmentDecision.status to rejected, explain why briefly, and do not put proposal-derived values in patch or nextSituation. Never turn an environment proposal directly into damage, healing, incapacity, winner state, or an unexplained combat bonus.
Match dramaPhase: opening establishes positions, rising changes leverage or surroundings, climax favors irreversible commitment and visible consequence without overriding mechanics.
nextSituation coefficients affect only the following turn and must remain between 0.25 and 2.5.`;

export const SENSORY_EVIDENCE_SYSTEM_PROMPT = `Describe only bounded, non-mechanical sensory evidence grounded in the committed turn and world.
Return JSON only:
{
  "sensoryEvidence": [{
    "evidenceId": "stable.ascii.id",
    "basisEventIds": ["committed.event.id"],
    "modality": "vision"|"sound"|"smell"|"touch"|"proprioception"|"atmosphere"|"other",
    "phenomenon": "what is sensed without hidden numbers or unsupported identity",
    "source": {"kind":"entity","entityId":"existing.id"}|{"kind":"event","eventId":"committed.id"}|{"kind":"ambient"},
    "revokesSubjectAccess"?: boolean,
    "accessBySide": {
      "a": ACCESS,
      "b": ACCESS
    },
    "publicAccess": ACCESS
  }]
}
ACCESS is {"currentAccess":"none"|"trace"|"coarse"|"clear","identityKnowledge":"unknown"|"suspected"|"identified","perceivedAs":string,"perceivedPhenomenon"?:string,"apparentIdentity"?:APPEARANCE,"direction":"unknown"|"front"|"front_right"|"right"|"back_right"|"back"|"back_left"|"left"|"front_left"|"above"|"below"|"around","distance":"unknown"|"contact"|"near"|"mid"|"far","occurrenceCertainty":"unknown"|"possible"|"probable"|"certain","attributionCertainty":"unknown"|"possible"|"probable"|"certain"}. APPEARANCE is {"form":string,"identity":string|null,"confidence":"unknown"|"possible"|"probable"|"certain","continuity":"same_entity"|"possibly_same_entity"|"unlinked"} and is an observer-local belief, never canonical identity.
direction and distance are independent. contact is a distance value only and must never appear in direction.
worldBefore is the committed semantic snapshot before this turn. Treat actions and events as the authoritative committed turn; never wait for or depend on another LLM response.
Emit at most 32 entries. Use separate entries for distinct modalities or phenomena.
The source field is server-only grounding. A side with unknown identity must not receive the source id, canonical label, or character name in phenomenon or perceivedAs.
Each ACCESS object describes perception of that exact source. When a character or object is the perceived subject, use an entity source even when a committed event caused the sensation. Use an event source only when the event itself, rather than one participating entity, is the perceived subject. Use ambient when no entity source is established.
For touch or proprioception in an actor's body, hand, or held tool, the perceived entity source is that actor. Do not use an unseen struck target as the source of self sensation; target effect and target uncertainty are supplied separately by deterministic evidence.
Do not mark a source identified merely because its canonical name appears in server input. Identity knowledge must follow the stated lighting, occlusion, and sensory evidence for each side.
identityKnowledge is only unknown, suspected, or identified. Never put certainty words such as certain in that field; occurrence and attribution certainty have their own fields.
Current access and identity knowledge are independent. A known subject may be temporarily inaccessible; a clearly heard impact may still have unknown attribution.
Use revokesSubjectAccess=true only when a committed event establishes all-modality loss of the subject itself, such as disappearance or leaving the scene. Never use it merely because one sound was unheard or one visual cue was occluded.
For transformation or disguise, put the observed form, claimed identity, confidence, and continuity belief in apparentIdentity without changing canonical identityKnowledge. A hallucinated person remains ambient or an observer-local contact and must not become a canonical entity.
Self sensation uses proprioception or touch and identified knowledge for that side. Source-less sound, smell, or atmosphere may use ambient.
Every ACCESS object must have a non-empty perceivedAs. Use a literal descriptor such as 知覚できない when currentAccess is none.
For an executed impact event, include touch or proprioception hand-feel for the actor when physically plausible; sound alone does not communicate impact feedback.
For every mechanicalEvidence entry with handFeelRequired=true, emit touch or proprioception whose entity source is character.<actorSide>. Use the qualitative bands only to choose wording; never repeat band keys or infer raw values.
When a committed event and world state make an object and action clearly visible, use clear access and identified knowledge rather than introducing unsupported doubt.
When a scene fact explicitly establishes a sensory phenomenon such as footsteps, smell, vibration, or atmosphere, emit grounded ambient evidence even if no entity source is known.
Do not invent damage, resource changes, exact quantities, exact hidden positions, identity, action legality, or persistent world changes.
If no grounded non-mechanical sensory cue exists, return an empty sensoryEvidence array.`;

export const COMBINED_PERCEPTION_SYSTEM_PROMPT = `${WORLD_RECONCILIATION_SYSTEM_PROMPT}

In the same response, independently add the sensoryEvidence array defined below. The patch and sensoryEvidence sections have separate validity: do not use sensory prose to justify an unsupported patch, and do not omit one section because the other is empty.

${SENSORY_EVIDENCE_SYSTEM_PROMPT.replace("Return JSON only:", "Add this field to the same JSON object:")}`;

export const WORLD_PERCEPTION_RESPONSE_FORMAT = perceptionResponseFormat(
  "kshiai_world_perception_v11",
  {
    patch: { $ref: "#/$defs/patch" },
    nextSituation: {
      anyOf: [
        { $ref: "#/$defs/nextSituation" },
        { type: "null" },
      ],
    },
    environmentDecision: {
      anyOf: [
        { $ref: "#/$defs/environmentDecision" },
        { type: "null" },
      ],
    },
  },
);

export const SENSORY_PERCEPTION_RESPONSE_FORMAT = perceptionResponseFormat(
  "kshiai_sensory_perception_v11",
  {
    sensoryEvidence: {
      type: "array",
      maxItems: 32,
      items: { $ref: "#/$defs/sensoryEvidence" },
    },
  },
);

export const COMBINED_PERCEPTION_RESPONSE_FORMAT = perceptionResponseFormat(
  "kshiai_combined_perception_v11",
  {
    patch: { $ref: "#/$defs/patch" },
    nextSituation: {
      anyOf: [
        { $ref: "#/$defs/nextSituation" },
        { type: "null" },
      ],
    },
    environmentDecision: {
      anyOf: [
        { $ref: "#/$defs/environmentDecision" },
        { type: "null" },
      ],
    },
    sensoryEvidence: {
      type: "array",
      maxItems: 32,
      items: { $ref: "#/$defs/sensoryEvidence" },
    },
  },
);

export const PERCEPTION_PROMPT_FIXTURES: readonly PerceptionPromptFixture[] = [
  darkImpactFixture(),
  ambientFootstepsFixture(),
  visiblePickupFixture(),
];

export function promptUserPayload(input: PerceptionPromptInput): string {
  return JSON.stringify(input);
}

export function worldPromptUserPayload(input: PerceptionPromptInput): string {
  const { mechanicalEvidence: _mechanicalEvidence, ...worldInput } = input;
  return JSON.stringify(worldInput);
}

export function sensoryPromptUserPayload(input: {
  turn: number;
  worldBefore: BattleSemanticState;
  actions: ResolvedBattleAction[];
  events: TurnEvent[];
  characters: PerceptionPromptInput["characters"];
  mechanicalEvidence: PerceptionPromptInput["mechanicalEvidence"];
}): string {
  return JSON.stringify(input);
}

export function scorePerceptionPromptCandidate(input: {
  fixture: PerceptionPromptFixture;
  candidate: PerceptionPromptCandidate;
}): PerceptionPromptSampleScore {
  if (input.fixture.id !== input.candidate.fixtureId) {
    throw new Error("candidate fixture id does not match fixture");
  }

  const rawWorld = record(input.candidate.rawWorldResponse);
  const rawSensory = input.candidate.rawSensoryResponse === undefined
    ? rawWorld
    : record(input.candidate.rawSensoryResponse);
  const patchResult = TurnSemanticPatchSchema.safeParse({
    ...record(rawWorld.patch),
    baseRevision: input.fixture.input.before.revision,
    turn: input.fixture.input.turn,
    sourceEventIds: input.fixture.input.events.flatMap((event) =>
      event.id ? [event.id] : []
    ),
  });
  const evidenceResult = PerceptionEvidenceSetSchema.safeParse(
    rawSensory.sensoryEvidence,
  );

  const evidence = evidenceResult.success ? evidenceResult.data : [];
  const sensoryScore = scoreSensoryEvidence(input.fixture, evidence);
  const tokenValues = input.candidate.calls.map((call) => call.totalTokens);
  const hasAllTokenMeasurements = tokenValues.every(
    (value): value is number => value !== null,
  );

  return {
    fixtureId: input.fixture.id,
    topology: input.candidate.topology,
    worldSchemaValid: patchResult.success,
    sensorySchemaValid: evidenceResult.success,
    worldPatchCorrectness: patchResult.success
      ? patchCorrectness(input.fixture.expectedPatch, patchResult.data)
      : 0,
    sensoryCoverage: sensoryScore.coverage,
    attributionErrors: sensoryScore.attributionErrors,
    attributionChecks: sensoryScore.attributionChecks,
    identityLeakages: sensoryScore.identityLeakages,
    identityLeakageChecks: sensoryScore.identityLeakageChecks,
    latencyMs: input.candidate.topology === "split"
      ? Math.max(...input.candidate.calls.map((call) => call.latencyMs))
      : input.candidate.calls.reduce(
          (total, call) => total + call.latencyMs,
          0,
        ),
    totalTokens: hasAllTokenMeasurements
      ? tokenValues.reduce((total, value) => total + value, 0)
      : null,
    observedWorldOperations: patchResult.success
      ? patchResult.data.operations.map((operation) => ({
          op: operation.op,
          path: operation.path,
        }))
      : [],
    observedSensoryCues: evidence.map((item) => ({
      modality: item.modality,
      sourceKind: item.source.kind,
      sourceKey: perceptionSourceKey(item.source),
      accessA: item.accessBySide.a.currentAccess,
      identityA: item.accessBySide.a.identityKnowledge,
      accessB: item.accessBySide.b.currentAccess,
      identityB: item.accessBySide.b.identityKnowledge,
    })),
    worldSchemaIssues: patchResult.success
      ? []
      : patchResult.error.issues.map(formatSchemaIssue),
    sensorySchemaIssues: evidenceResult.success
      ? []
      : evidenceResult.error.issues.map(formatSchemaIssue),
  };
}

export function aggregatePerceptionPromptScores(
  scores: readonly PerceptionPromptSampleScore[],
): PerceptionPromptAggregate {
  if (scores.length === 0) throw new Error("at least one prompt score is required");
  const topology = scores[0]!.topology;
  if (scores.some((score) => score.topology !== topology)) {
    throw new Error("cannot aggregate mixed prompt topologies");
  }
  const latencies = scores.map((score) => score.latencyMs).sort((a, b) => a - b);
  const tokenSamples = scores.flatMap((score) =>
    score.totalTokens === null ? [] : [score.totalTokens]
  );
  const attributionChecks = sum(scores.map((score) => score.attributionChecks));
  const identityChecks = sum(scores.map((score) => score.identityLeakageChecks));

  return {
    fixtureVersion: PERCEPTION_PROMPT_FIXTURE_VERSION,
    topology,
    sampleCount: scores.length,
    worldSchemaValidRate: mean(scores.map((score) =>
      score.worldSchemaValid ? 1 : 0
    )),
    sensorySchemaValidRate: mean(scores.map((score) =>
      score.sensorySchemaValid ? 1 : 0
    )),
    worldPatchCorrectness: mean(scores.map((score) =>
      score.worldPatchCorrectness
    )),
    sensoryCoverage: mean(scores.map((score) => score.sensoryCoverage)),
    attributionErrorRate: attributionChecks === 0
      ? 0
      : sum(scores.map((score) => score.attributionErrors)) / attributionChecks,
    identityLeakageRate: identityChecks === 0
      ? 0
      : sum(scores.map((score) => score.identityLeakages)) / identityChecks,
    meanLatencyMs: mean(latencies),
    p95LatencyMs: percentile(latencies, 0.95),
    measuredTokenSamples: tokenSamples.length,
    meanTotalTokens: tokenSamples.length > 0 ? mean(tokenSamples) : null,
    totalTokens: tokenSamples.length > 0 ? sum(tokenSamples) : null,
  };
}

export function recommendPerceptionPromptTopology(input: {
  combined: PerceptionPromptAggregate;
  split: PerceptionPromptAggregate;
}): PerceptionPromptRecommendation {
  if (input.combined.topology !== "combined" || input.split.topology !== "split") {
    throw new Error("combined and split aggregates are required in their named slots");
  }
  const combinedFailures = qualityFailures(input.combined);
  const splitFailures = qualityFailures(input.split);
  if (
    input.combined.sampleCount < PERCEPTION_PROMPT_QUALITY_FLOORS.minimumSamples ||
    input.split.sampleCount < PERCEPTION_PROMPT_QUALITY_FLOORS.minimumSamples
  ) {
    return {
      topology: null,
      reason: "insufficient_samples",
      combinedFailures,
      splitFailures,
    };
  }
  if (combinedFailures.length === 0) {
    return {
      topology: "combined",
      reason: "combined_meets_quality_floor",
      combinedFailures,
      splitFailures,
    };
  }
  if (splitFailures.length === 0) {
    return {
      topology: "split",
      reason: "combined_below_floor_split_meets_floor",
      combinedFailures,
      splitFailures,
    };
  }
  return {
    topology: null,
    reason: "no_topology_meets_quality_floor",
    combinedFailures,
    splitFailures,
  };
}

export function referenceCandidate(input: {
  fixture: PerceptionPromptFixture;
  topology: PerceptionPromptTopology;
  latencyMs?: number;
  totalTokens?: number;
}): PerceptionPromptCandidate {
  const response = {
    patch: {
      operations: structuredClone(input.fixture.expectedPatch.operations),
    },
    sensoryEvidence: structuredClone(input.fixture.expectedSensoryEvidence),
  };
  return {
    fixtureId: input.fixture.id,
    topology: input.topology,
    rawWorldResponse: input.topology === "combined"
      ? response
      : { patch: response.patch },
    rawSensoryResponse: input.topology === "split"
      ? { sensoryEvidence: response.sensoryEvidence }
      : undefined,
    calls: input.topology === "combined"
      ? [measurement(input.latencyMs ?? 10, input.totalTokens ?? 100)]
      : [
          measurement(input.latencyMs ?? 10, input.totalTokens ?? 100),
          measurement(input.latencyMs ?? 10, input.totalTokens ?? 100),
        ],
  };
}

function scoreSensoryEvidence(
  fixture: PerceptionPromptFixture,
  actual: PerceptionEvidence[],
): {
  coverage: number;
  attributionErrors: number;
  attributionChecks: number;
  identityLeakages: number;
  identityLeakageChecks: number;
} {
  let matched = 0;
  let attributionErrors = 0;
  let attributionChecks = 0;
  let identityLeakages = 0;
  let identityLeakageChecks = 0;

  for (const requirement of fixture.sensoryRequirements) {
    const candidates = actual.filter((item) =>
      requirement.acceptedModalities.includes(item.modality) &&
      requirement.acceptedSourceKeys.includes(perceptionSourceKey(item.source))
    );
    const candidate = candidates.sort((left, right) =>
      accessErrorCount(left, requirement) - accessErrorCount(right, requirement)
    )[0];
    if (!candidate) continue;
    matched += 1;
    for (const side of ["a", "b"] as const) {
      attributionChecks += 2;
      if (!requirement.expectedAccessBySide[side].currentAccess.includes(
        candidate.accessBySide[side].currentAccess,
      )) {
        attributionErrors += 1;
      }
      if (!requirement.expectedAccessBySide[side].identityKnowledge.includes(
        candidate.accessBySide[side].identityKnowledge,
      )) {
        attributionErrors += 1;
      }
    }
  }

  for (const evidence of actual) {
    for (const side of ["a", "b"] as const) {
      const access = evidence.accessBySide[side];
      const text = [
        evidence.phenomenon,
        access.perceivedAs,
        access.perceivedPhenomenon ?? "",
        access.apparentIdentity?.form ?? "",
        access.apparentIdentity?.identity ?? "",
      ].join("\n")
        .toLocaleLowerCase("ja");
      for (const term of fixture.forbiddenIdentityTermsBySide[side]) {
        identityLeakageChecks += 1;
        if (text.includes(term.toLocaleLowerCase("ja"))) identityLeakages += 1;
      }
    }
  }

  return {
    coverage: fixture.sensoryRequirements.length === 0
      ? (actual.length === 0 ? 1 : 0)
      : matched / fixture.sensoryRequirements.length,
    attributionErrors,
    attributionChecks,
    identityLeakages,
    identityLeakageChecks,
  };
}

function patchCorrectness(
  expected: TurnSemanticPatch,
  actual: TurnSemanticPatch,
): number {
  const expectedOperations = expected.operations.map(stableJson);
  const actualOperations = actual.operations.map(stableJson);
  if (expectedOperations.length === 0) return actualOperations.length === 0 ? 1 : 0;
  const actualSet = new Set(actualOperations);
  const matched = expectedOperations.filter((operation) => actualSet.has(operation)).length;
  return matched / Math.max(expectedOperations.length, actualOperations.length);
}

function qualityFailures(aggregate: PerceptionPromptAggregate): string[] {
  const failures: string[] = [];
  if (
    aggregate.worldSchemaValidRate <
      PERCEPTION_PROMPT_QUALITY_FLOORS.worldSchemaValidRate
  ) failures.push("world_schema_valid_rate");
  if (
    aggregate.sensorySchemaValidRate <
      PERCEPTION_PROMPT_QUALITY_FLOORS.sensorySchemaValidRate
  ) failures.push("sensory_schema_valid_rate");
  if (
    aggregate.worldPatchCorrectness <
      PERCEPTION_PROMPT_QUALITY_FLOORS.worldPatchCorrectness
  ) failures.push("world_patch_correctness");
  if (
    aggregate.sensoryCoverage < PERCEPTION_PROMPT_QUALITY_FLOORS.sensoryCoverage
  ) failures.push("sensory_coverage");
  if (
    aggregate.attributionErrorRate >
      PERCEPTION_PROMPT_QUALITY_FLOORS.maximumAttributionErrorRate
  ) failures.push("attribution_error_rate");
  if (
    aggregate.identityLeakageRate >
      PERCEPTION_PROMPT_QUALITY_FLOORS.maximumIdentityLeakageRate
  ) failures.push("identity_leakage_rate");
  return failures;
}

function darkImpactFixture(): PerceptionPromptFixture {
  const input = baseInput(3, {
    sceneSummary: "照明の落ちた地下通路",
    sceneFacts: { lighting: "dark", echoes: true },
  });
  input.actions = [{
    id: "action.dark.1",
    actorSide: "a",
    kind: "basic_attack",
    executed: true,
    skippedReason: null,
  }];
  input.events = [{
    id: "event.dark.impact.1",
    type: "damage",
    actorName: "燈火の剣士",
    actorSide: "a",
    targetName: "夜渡り",
    targetSides: ["b"],
    sourceActionId: "action.dark.1",
    intensity: "heavy",
    summary: "暗闇へ放った一撃が何かへ強く命中した。",
  }];
  input.mechanicalEvidence = [{
    eventId: "event.dark.impact.1",
    kind: "impact",
    actorSide: "a",
    targetSides: ["b"],
    parameterClass: "vitality",
    direction: "loss",
    absoluteBand: "heavy",
    relativeBand: "solid",
    outcome: "effective",
    handFeelRequired: true,
  }];
  return {
    id: "dark-unidentified-impact",
    description: "A feels a strong impact in darkness without identifying B.",
    input,
    expectedPatch: patch(input, []),
    expectedSensoryEvidence: [{
      evidenceId: "evidence.dark.impact",
      basisEventIds: ["event.dark.impact.1"],
      modality: "touch",
      phenomenon: "自分の手元へ武器越しに重い手応えが返る",
      source: { kind: "entity", entityId: "character.a" },
      accessBySide: {
        a: access("clear", "identified", "自分自身の手元に返る手応え", "front", "contact", "certain", "certain"),
        b: access("none", "unknown", "知覚できない", "unknown", "unknown", "unknown", "unknown"),
      },
      publicAccess: access("coarse", "unknown", "暗闇で起きた衝突", "unknown", "unknown", "certain", "unknown"),
    }],
    sensoryRequirements: [sensoryRequirement(
      ["touch", "proprioception"],
      ["entity:character.a"],
      expectedAccess(["clear"], ["identified"]),
      expectedAccess(["none"], ["unknown"]),
    )],
    forbiddenIdentityTermsBySide: {
      a: ["夜渡り", "character.b"],
      b: [],
    },
  };
}

function ambientFootstepsFixture(): PerceptionPromptFixture {
  const input = baseInput(6, {
    sceneSummary: "霧の濃い石造回廊",
    sceneFacts: { visibility: "poor", distant_activity: "footsteps" },
  });
  input.events = [{
    id: "event.ambient.footsteps.1",
    type: "info",
    summary: "霧の向こうから、誰のものか判別できない足音が響いている。",
  }];
  return {
    id: "ambient-source-less-footsteps",
    description: "Both sides hear footsteps whose source is not established.",
    input,
    expectedPatch: patch(input, []),
    expectedSensoryEvidence: [{
      evidenceId: "evidence.ambient.footsteps",
      basisEventIds: ["event.ambient.footsteps.1"],
      modality: "sound",
      phenomenon: "霧の向こうから所在の定まらない足音が響く",
      source: { kind: "ambient" },
      accessBySide: {
        a: access("trace", "unknown", "どこからともなく聞こえる足音", "around", "far", "certain", "unknown"),
        b: access("trace", "unknown", "どこからともなく聞こえる足音", "around", "far", "certain", "unknown"),
      },
      publicAccess: access("trace", "unknown", "霧の奥の足音", "around", "far", "certain", "unknown"),
    }],
    sensoryRequirements: [sensoryRequirement(
      ["sound"],
      ["ambient", "event:event.ambient.footsteps.1"],
      expectedAccess(["trace", "coarse", "clear"], ["unknown"]),
      expectedAccess(["trace", "coarse", "clear"], ["unknown"]),
    )],
    forbiddenIdentityTermsBySide: {
      a: ["夜渡り", "character.b"],
      b: ["燈火の剣士", "character.a"],
    },
  };
}

function visiblePickupFixture(): PerceptionPromptFixture {
  const input = baseInput(8, {
    sceneSummary: "白日の廃工場",
    sceneFacts: {
      lighting: "bright",
      line_of_sight: "clear_between_combatants",
    },
    extraEntities: {
      "iron_pipe.1": {
        kind: "object",
        label: "鉄パイプ",
        location: { type: "scene", area: "中央の床" },
        active: true,
        createdTurn: 0,
        updatedTurn: 0,
        facts: {},
      },
    },
  });
  input.events = [{
    id: "event.pickup.1",
    type: "situation",
    actorName: "燈火の剣士",
    actorSide: "a",
    targetName: "鉄パイプ",
    summary: "双方の視界が通る明所で、燈火の剣士が床の鉄パイプを拾い上げた。",
  }];
  return {
    id: "visible-persistent-pickup",
    description: "A visible pickup must update the world and remain identifiable.",
    input,
    expectedPatch: patch(input, [{
      op: "replace",
      path: "/entities/iron_pipe.1/location",
      value: { type: "held", side: "a" },
    }]),
    expectedSensoryEvidence: [{
      evidenceId: "evidence.pickup.vision",
      basisEventIds: ["event.pickup.1"],
      modality: "vision",
      phenomenon: "燈火の剣士が鉄パイプを拾い上げる",
      source: { kind: "entity", entityId: "iron_pipe.1" },
      accessBySide: {
        a: access("clear", "identified", "手にした鉄パイプ", "front", "contact", "certain", "certain"),
        b: access("clear", "identified", "燈火の剣士が持つ鉄パイプ", "front", "mid", "certain", "certain"),
      },
      publicAccess: access("clear", "identified", "燈火の剣士が持つ鉄パイプ", "front", "mid", "certain", "certain"),
    }],
    sensoryRequirements: [sensoryRequirement(
      ["vision", "sound"],
      ["entity:iron_pipe.1", "entity:character.a"],
      expectedAccess(["clear"], ["identified"]),
      expectedAccess(["clear"], ["identified"]),
    )],
    forbiddenIdentityTermsBySide: { a: [], b: [] },
  };
}

function baseInput(
  turn: number,
  options: {
    sceneSummary: string;
    sceneFacts: Record<string, string | boolean>;
    extraEntities?: BattleSemanticState["entities"];
  },
): PerceptionPromptInput {
  return {
    turn,
    before: {
      schemaVersion: 1,
      revision: turn - 1,
      scene: { summary: options.sceneSummary, facts: options.sceneFacts },
      entities: {
        "character.a": characterEntity("燈火の剣士", "西側"),
        "character.b": characterEntity("夜渡り", "東側"),
        ...(options.extraEntities ?? {}),
      },
    },
    actions: [],
    events: [],
    battlefield: {
      displayName: options.sceneSummary,
      terrain: "石と鉄の通路",
      obstacles: [],
      conditions: Object.values(options.sceneFacts).map(String),
    },
    characters: {
      a: promptCharacter("燈火の剣士"),
      b: promptCharacter("夜渡り"),
    },
    environmentBeatDue: false,
    environmentProposal: null,
    dramaPhase: "rising",
    mechanicalEvidence: [],
  };
}

function characterEntity(
  label: string,
  area: string,
): BattleSemanticState["entities"][string] {
  return {
    kind: "character",
    label,
    location: { type: "scene", area },
    active: true,
    createdTurn: 0,
    updatedTurn: 0,
    facts: { visible_conditions: {} },
  };
}

function promptCharacter(displayName: string): PerceptionPromptCharacter {
  return {
    displayName,
    appearanceSummary: `${displayName}の外見`,
    traits: ["慎重"],
    basicAttack: { name: "基本攻撃", description: "手持ちの武器で攻撃する" },
    skills: [],
  };
}

function patch(
  input: PerceptionPromptInput,
  operations: TurnSemanticPatch["operations"],
): TurnSemanticPatch {
  return {
    baseRevision: input.before.revision,
    turn: input.turn,
    sourceEventIds: input.events.flatMap((event) => event.id ? [event.id] : []),
    operations,
  };
}

function access(
  currentAccess: PerceptionEvidence["accessBySide"]["a"]["currentAccess"],
  identityKnowledge: PerceptionEvidence["accessBySide"]["a"]["identityKnowledge"],
  perceivedAs: string,
  direction: PerceptionEvidence["accessBySide"]["a"]["direction"],
  distance: PerceptionEvidence["accessBySide"]["a"]["distance"],
  occurrenceCertainty: PerceptionEvidence["accessBySide"]["a"]["occurrenceCertainty"],
  attributionCertainty: PerceptionEvidence["accessBySide"]["a"]["attributionCertainty"],
): PerceptionEvidence["accessBySide"]["a"] {
  return {
    currentAccess,
    identityKnowledge,
    perceivedAs,
    direction,
    distance,
    occurrenceCertainty,
    attributionCertainty,
  };
}

function measurement(latencyMs: number, totalTokens: number): PromptCallMeasurement {
  return {
    latencyMs,
    inputTokens: null,
    outputTokens: null,
    totalTokens,
  };
}

function sensoryRequirement(
  acceptedModalities: PerceptionEvidence["modality"][],
  acceptedSourceKeys: string[],
  a: ExpectedPerceptionAccess,
  b: ExpectedPerceptionAccess,
): PerceptionPromptFixture["sensoryRequirements"][number] {
  return {
    acceptedModalities,
    acceptedSourceKeys,
    expectedAccessBySide: { a, b },
  };
}

function expectedAccess(
  currentAccess: ExpectedPerceptionAccess["currentAccess"],
  identityKnowledge: ExpectedPerceptionAccess["identityKnowledge"],
): ExpectedPerceptionAccess {
  return { currentAccess, identityKnowledge };
}

function accessErrorCount(
  evidence: PerceptionEvidence,
  requirement: PerceptionPromptFixture["sensoryRequirements"][number],
): number {
  let errors = 0;
  for (const side of ["a", "b"] as const) {
    if (!requirement.expectedAccessBySide[side].currentAccess.includes(
      evidence.accessBySide[side].currentAccess,
    )) errors += 1;
    if (!requirement.expectedAccessBySide[side].identityKnowledge.includes(
      evidence.accessBySide[side].identityKnowledge,
    )) errors += 1;
  }
  return errors;
}

function perceptionSourceKey(source: PerceptionEvidence["source"]): string {
  if (source.kind === "entity") return `entity:${source.entityId}`;
  if (source.kind === "event") return `event:${source.eventId}`;
  return "ambient";
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function perceptionResponseFormat(
  name: string,
  properties: Record<string, unknown>,
): PerceptionPromptResponseFormat {
  return {
    type: "json_schema",
    json_schema: {
      name,
      strict: true,
      schema: {
        type: "object",
        properties,
        required: Object.keys(properties),
        additionalProperties: false,
        $defs: perceptionJsonSchemaDefinitions(),
      },
    },
  };
}

function perceptionJsonSchemaDefinitions(): Record<string, unknown> {
  const definitions: Record<string, unknown> = {};
  const scalarVariants = (): Array<Record<string, unknown>> => [{
    type: "string",
    maxLength: 2000,
  }, {
    type: "number",
  }, {
    type: "boolean",
  }, {
    type: "null",
  }];
  definitions.semanticValue0 = { anyOf: scalarVariants() };
  for (let depth = 1; depth <= 6; depth += 1) {
    definitions[`semanticValue${depth}`] = {
      anyOf: [
        ...scalarVariants(),
        {
          type: "array",
          maxItems: 64,
          items: { $ref: `#/$defs/semanticValue${depth - 1}` },
        },
        {
          type: "object",
          additionalProperties: {
            $ref: `#/$defs/semanticValue${depth - 1}`,
          },
        },
      ],
    };
  }

  const semanticId = {
    type: "string",
    minLength: 1,
    maxLength: 80,
    pattern: "^[A-Za-z0-9][A-Za-z0-9._:-]*$",
  };
  definitions.apparentIdentity = {
    type: "object",
    properties: {
      form: { type: "string", minLength: 1, maxLength: 400 },
      identity: {
        anyOf: [
          { type: "string", minLength: 1, maxLength: 240 },
          { type: "null" },
        ],
      },
      confidence: {
        type: "string",
        enum: ["unknown", "possible", "probable", "certain"],
      },
      continuity: {
        type: "string",
        enum: ["same_entity", "possibly_same_entity", "unlinked"],
      },
    },
    required: ["form", "identity", "confidence", "continuity"],
    additionalProperties: false,
  };
  const access = {
    type: "object",
    properties: {
      currentAccess: {
        type: "string",
        enum: ["none", "trace", "coarse", "clear"],
      },
      identityKnowledge: {
        type: "string",
        enum: ["unknown", "suspected", "identified"],
      },
      perceivedAs: {
        type: "string",
        minLength: 1,
        maxLength: 240,
      },
      perceivedPhenomenon: {
        type: "string",
        minLength: 1,
        maxLength: 400,
      },
      apparentIdentity: { $ref: "#/$defs/apparentIdentity" },
      direction: {
        type: "string",
        enum: [
          "unknown",
          "front",
          "front_right",
          "right",
          "back_right",
          "back",
          "back_left",
          "left",
          "front_left",
          "above",
          "below",
          "around",
        ],
      },
      distance: {
        type: "string",
        enum: ["unknown", "contact", "near", "mid", "far"],
      },
      occurrenceCertainty: {
        type: "string",
        enum: ["unknown", "possible", "probable", "certain"],
      },
      attributionCertainty: {
        type: "string",
        enum: ["unknown", "possible", "probable", "certain"],
      },
    },
    required: [
      "currentAccess",
      "identityKnowledge",
      "perceivedAs",
      "direction",
      "distance",
      "occurrenceCertainty",
      "attributionCertainty",
    ],
    additionalProperties: false,
  };
  definitions.perceptionAccess = access;
  definitions.perceptionSource = {
    anyOf: [{
      type: "object",
      properties: {
        kind: { type: "string", const: "entity" },
        entityId: semanticId,
      },
      required: ["kind", "entityId"],
      additionalProperties: false,
    }, {
      type: "object",
      properties: {
        kind: { type: "string", const: "event" },
        eventId: semanticId,
      },
      required: ["kind", "eventId"],
      additionalProperties: false,
    }, {
      type: "object",
      properties: {
        kind: { type: "string", const: "ambient" },
      },
      required: ["kind"],
      additionalProperties: false,
    }],
  };
  definitions.sensoryEvidence = {
    type: "object",
    properties: {
      evidenceId: semanticId,
      basisEventIds: {
        type: "array",
        maxItems: 16,
        items: semanticId,
      },
      modality: {
        type: "string",
        enum: [
          "vision",
          "sound",
          "smell",
          "touch",
          "proprioception",
          "atmosphere",
          "other",
        ],
      },
      phenomenon: {
        type: "string",
        minLength: 1,
        maxLength: 400,
      },
      source: { $ref: "#/$defs/perceptionSource" },
      revokesSubjectAccess: { type: "boolean" },
      accessBySide: {
        type: "object",
        properties: {
          a: { $ref: "#/$defs/perceptionAccess" },
          b: { $ref: "#/$defs/perceptionAccess" },
        },
        required: ["a", "b"],
        additionalProperties: false,
      },
      publicAccess: { $ref: "#/$defs/perceptionAccess" },
    },
    required: [
      "evidenceId",
      "basisEventIds",
      "modality",
      "phenomenon",
      "source",
      "accessBySide",
      "publicAccess",
    ],
    additionalProperties: false,
  };
  definitions.semanticOperation = {
    anyOf: [{
      type: "object",
      properties: {
        op: { type: "string", const: "add" },
        path: { type: "string", minLength: 1, maxLength: 500 },
        value: { $ref: "#/$defs/semanticValue6" },
      },
      required: ["op", "path", "value"],
      additionalProperties: false,
    }, {
      type: "object",
      properties: {
        op: { type: "string", const: "replace" },
        path: { type: "string", minLength: 1, maxLength: 500 },
        value: { $ref: "#/$defs/semanticValue6" },
      },
      required: ["op", "path", "value"],
      additionalProperties: false,
    }, {
      type: "object",
      properties: {
        op: { type: "string", const: "remove" },
        path: { type: "string", minLength: 1, maxLength: 500 },
      },
      required: ["op", "path"],
      additionalProperties: false,
    }],
  };
  definitions.patch = {
    type: "object",
    properties: {
      operations: {
        type: "array",
        maxItems: 24,
        items: { $ref: "#/$defs/semanticOperation" },
      },
    },
    required: ["operations"],
    additionalProperties: false,
  };
  definitions.nextSituation = {
    type: "object",
    properties: {
      notes: { type: "string", maxLength: 1000 },
      tags: {
        type: "array",
        maxItems: 16,
        items: { type: "string", maxLength: 120 },
      },
      coefficients: {
        type: "object",
        additionalProperties: {
          type: "number",
          minimum: 0.25,
          maximum: 2.5,
        },
      },
    },
    required: ["notes", "tags", "coefficients"],
    additionalProperties: false,
  };
  definitions.environmentDecision = {
    type: "object",
    properties: {
      status: {
        type: "string",
        enum: ["accepted", "rejected"],
      },
      reason: {
        type: "string",
        minLength: 1,
        maxLength: 240,
      },
    },
    required: ["status", "reason"],
    additionalProperties: false,
  };
  return definitions;
}

function mean(values: readonly number[]): number {
  return sum(values) / values.length;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function percentile(sortedValues: readonly number[], ratio: number): number {
  const index = Math.max(
    0,
    Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * ratio) - 1),
  );
  return sortedValues[index]!;
}

function formatSchemaIssue(issue: { path: Array<string | number>; message: string }): string {
  const path = issue.path.length > 0 ? issue.path.join(".") : "<root>";
  return `${path}: ${issue.message}`.slice(0, 300);
}
