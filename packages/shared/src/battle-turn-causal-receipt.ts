import { z } from "zod";
import {
  ActionKindSchema,
  ActionResolutionReasonSchema,
  CharacterActionIntentSchema,
  ResolvedBattleActionSchema,
  TurnEventSchema,
  type BattleState,
  type CharacterActionIntent,
  type ResolvedBattleAction,
  type TurnEvent,
} from "./battle.js";
import { ParamKeySchema } from "./character.js";
import {
  BattleSideSchema,
  CommittedMechanicalEvidenceSchema,
  NarrationPerceptionViewSchema,
  QualitativeMechanicalChangeSchema,
  QuantizedChangeSchema,
  ReserveBandSchema,
  ReserveParameterKeySchema,
  ServerOnlyReserveCueSchema,
  type CommittedMechanicalEvidence,
  type NarrationPerceptionView,
} from "./perception.js";
import {
  applyTurnSemanticPatch,
  SemanticObservationStateSchema,
  SemanticPatchOperationSchema,
  TurnSemanticPatchSchema,
  type SemanticObservationState,
  type SemanticPatchOperation,
  type TurnSemanticPatch,
} from "./semantic-state.js";
import {
  buildServerOnlyReserveCues,
  quantizeCommittedMechanicalEvidence,
} from "./perception-quantization.js";

const EvidenceValidationStatusSchema = z.enum([
  "valid",
  "rejected",
  "unavailable",
]);

const ActionExecutionSkipReasonSchema = z.enum([
  "incapacitated_before_action",
  "battle_inactive",
  "action_infeasible",
]);

const CausalActionResolutionSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("unknown") }).strict(),
  z.object({
    status: z.literal("known"),
    outcome: z.enum(["accepted", "partial", "substituted", "failed"]),
    reason: ActionResolutionReasonSchema.nullable(),
  }).strict(),
]);

const BattleTurnCausalActionSchema = z.object({
  actionId: z.string().min(1).max(120),
  actorSide: BattleSideSchema,
  requested: CharacterActionIntentSchema.nullable(),
  effective: CharacterActionIntentSchema,
  executed: z.boolean(),
  skippedReason: ActionExecutionSkipReasonSchema.nullable(),
  resolution: CausalActionResolutionSchema,
  events: z.array(TurnEventSchema).max(64),
  mechanicalEvidence: z.array(CommittedMechanicalEvidenceSchema).max(64),
}).strict();

const AcceptedSemanticChangeSchema = z.object({
  sourceEventIds: z.array(z.string().min(1).max(120)).max(32),
  sourceActionIds: z.array(z.string().min(1).max(120)).max(16),
  unattributedSourceEventIds: z.array(z.string().min(1).max(120)).max(32),
  operations: z.array(SemanticPatchOperationSchema).max(24),
}).strict();

const CausalSemanticResultSchema = z.object({
  status: z.enum(["applied", "rejected", "skipped"]),
  fromRevision: z.number().int().nonnegative(),
  toRevision: z.number().int().nonnegative(),
  acceptedChange: AcceptedSemanticChangeSchema.nullable(),
}).strict().superRefine((semantic, ctx) => {
  if ((semantic.status === "applied") !== (semantic.acceptedChange !== null)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["acceptedChange"],
      message: "only an applied semantic result may carry an accepted change",
    });
  }
});

const CarryForwardParticipantSchema = z.object({
  side: BattleSideSchema,
  before: z.object({
    canFight: z.boolean(),
    defending: z.boolean(),
    reserveCues: z.array(ServerOnlyReserveCueSchema).max(12),
  }).strict(),
  after: z.object({
    canFight: z.boolean(),
    defending: z.boolean(),
    reserveCues: z.array(ServerOnlyReserveCueSchema).max(12),
  }).strict(),
}).strict();

/**
 * Server-only, ephemeral receipt assembled from the owners that have already
 * committed a turn. IDs remain here solely to preserve exact provenance.
 */
export const BattleTurnCausalReceiptSchema = z.object({
  schemaVersion: z.literal(1),
  turn: z.number().int().nonnegative(),
  actions: z.array(BattleTurnCausalActionSchema).max(2),
  unlinkedEvents: z.array(TurnEventSchema).max(64),
  unlinkedMechanicalEvidence: z
    .array(CommittedMechanicalEvidenceSchema)
    .max(64),
  semantic: CausalSemanticResultSchema,
  carryForward: z.array(CarryForwardParticipantSchema).length(2),
}).strict();

export type BattleTurnCausalReceipt = z.infer<
  typeof BattleTurnCausalReceiptSchema
>;

export type CausalReceiptBuildIssue = {
  code:
    | "invalid_input"
    | "turn_mismatch"
    | "duplicate_id"
    | "dangling_link"
    | "uncommitted_evidence"
    | "invalid_semantic_transition";
  message: string;
};

export type BuildBattleTurnCausalReceiptResult =
  | { ok: true; receipt: BattleTurnCausalReceipt }
  | { ok: false; issues: CausalReceiptBuildIssue[] };

export type BuildBattleTurnCausalReceiptInput = {
  turn: number;
  before: BattleState;
  after: BattleState;
  actions: readonly ResolvedBattleAction[];
  events: readonly TurnEvent[];
  mechanicalEvidence: readonly CommittedMechanicalEvidence[];
  mechanicalEvidenceStatus: z.infer<typeof EvidenceValidationStatusSchema>;
  semanticTransition: NonNullable<BattleState["latestSemanticTransition"]>;
};

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function effectiveIntent(action: ResolvedBattleAction): CharacterActionIntent {
  return CharacterActionIntentSchema.parse({
    kind: action.kind,
    ...(action.skillId !== undefined ? { skillId: action.skillId } : {}),
    ...(action.useFinisher !== undefined
      ? { useFinisher: action.useFinisher }
      : {}),
    ...(action.description !== undefined
      ? { description: action.description }
      : {}),
    ...(action.desiredOutcome !== undefined
      ? { desiredOutcome: action.desiredOutcome }
      : {}),
    ...(action.subjectRefs !== undefined
      ? { subjectRefs: [...action.subjectRefs] }
      : {}),
    ...(action.instrumentRef !== undefined
      ? { instrumentRef: action.instrumentRef }
      : {}),
    ...(action.opportunityId !== undefined
      ? { opportunityId: action.opportunityId }
      : {}),
  });
}

function duplicateValues(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}

function participantCarryForward(
  side: "a" | "b",
  before: BattleState,
  after: BattleState,
): z.infer<typeof CarryForwardParticipantSchema> {
  const beforeCombatant = side === "a" ? before.sideA : before.sideB;
  const afterCombatant = side === "a" ? after.sideA : after.sideB;
  return CarryForwardParticipantSchema.parse({
    side,
    before: {
      canFight: beforeCombatant.canFight,
      defending: beforeCombatant.defending,
      reserveCues: buildServerOnlyReserveCues({
        side,
        parameters: beforeCombatant.parameters,
        baseParameters: beforeCombatant.baseParameters,
      }),
    },
    after: {
      canFight: afterCombatant.canFight,
      defending: afterCombatant.defending,
      reserveCues: buildServerOnlyReserveCues({
        side,
        parameters: afterCombatant.parameters,
        baseParameters: afterCombatant.baseParameters,
      }),
    },
  });
}

function validateSemanticTransition(input: {
  turn: number;
  before: BattleState;
  after: BattleState;
  transition: BuildBattleTurnCausalReceiptInput["semanticTransition"];
  eventById: ReadonlyMap<string, TurnEvent>;
}): { patch: TurnSemanticPatch | null; issues: CausalReceiptBuildIssue[] } {
  const issues: CausalReceiptBuildIssue[] = [];
  const { transition } = input;
  const beforeSemantic = input.before.semanticState;
  const afterSemantic = input.after.semanticState;
  const beforeRevision = beforeSemantic?.revision ?? 0;
  const afterRevision = afterSemantic?.revision ?? 0;

  if (
    transition.turn !== input.turn ||
    transition.fromRevision !== beforeRevision ||
    transition.toRevision !== afterRevision
  ) {
    issues.push({
      code: "invalid_semantic_transition",
      message: "semantic transition turn or revisions do not match before/after state",
    });
    return { patch: null, issues };
  }

  if (transition.status !== "applied") {
    if (!jsonEqual(beforeSemantic, afterSemantic)) {
      issues.push({
        code: "invalid_semantic_transition",
        message: "a rejected or skipped semantic transition cannot change state",
      });
    }
    return { patch: null, issues };
  }

  const parsedPatch = TurnSemanticPatchSchema.safeParse(transition.patch);
  if (!beforeSemantic || !afterSemantic || !parsedPatch.success) {
    issues.push({
      code: "invalid_semantic_transition",
      message: "an applied semantic transition requires a valid patch and states",
    });
    return { patch: null, issues };
  }
  const unknownSourceIds = parsedPatch.data.sourceEventIds.filter(
    (eventId) => !input.eventById.has(eventId),
  );
  if (unknownSourceIds.length > 0) {
    issues.push({
      code: "dangling_link",
      message: `semantic patch references unknown events: ${unknownSourceIds.join(", ")}`,
    });
    return { patch: null, issues };
  }
  const applied = applyTurnSemanticPatch({
    state: beforeSemantic,
    patch: parsedPatch.data,
    turn: input.turn,
    allowedSourceEventIds: new Set(input.eventById.keys()),
  });
  if (!applied.ok || !jsonEqual(applied.state, afterSemantic)) {
    issues.push({
      code: "invalid_semantic_transition",
      message: "accepted semantic patch does not reproduce the committed after state",
    });
    return { patch: null, issues };
  }
  return { patch: parsedPatch.data, issues };
}

/** Assemble an exact causal receipt without reading prose or inventing links. */
export function buildBattleTurnCausalReceipt(
  input: BuildBattleTurnCausalReceiptInput,
): BuildBattleTurnCausalReceiptResult {
  const issues: CausalReceiptBuildIssue[] = [];
  const parsedStatus = EvidenceValidationStatusSchema.safeParse(
    input.mechanicalEvidenceStatus,
  );
  const parsedEvents = z.array(TurnEventSchema).max(128).safeParse(input.events);
  const parsedActions = z.array(ResolvedBattleActionSchema).max(2)
    .safeParse(input.actions);
  const parsedEvidence = z.array(CommittedMechanicalEvidenceSchema).max(128)
    .safeParse(input.mechanicalEvidence);
  if (
    !parsedStatus.success ||
    !parsedActions.success ||
    !parsedEvents.success ||
    !parsedEvidence.success
  ) {
    return {
      ok: false,
      issues: [{ code: "invalid_input", message: "causal receipt input is invalid" }],
    };
  }
  if (input.turn !== input.after.turn || input.before.turn + 1 !== input.turn) {
    issues.push({
      code: "turn_mismatch",
      message: "causal receipt must describe exactly one committed ordinary turn",
    });
  }

  const actionIds = parsedActions.data.map((action) => action.id);
  const duplicateActionIds = duplicateValues(actionIds);
  if (duplicateActionIds.length > 0) {
    issues.push({
      code: "duplicate_id",
      message: `duplicate action IDs: ${duplicateActionIds.join(", ")}`,
    });
  }
  const duplicateActorSides = duplicateValues(
    parsedActions.data.map((action) => action.actorSide),
  );
  if (duplicateActorSides.length > 0) {
    issues.push({
      code: "duplicate_id",
      message: `duplicate action actor sides: ${duplicateActorSides.join(", ")}`,
    });
  }
  const actionsById = new Map(
    parsedActions.data.map((action) => [action.id, action]),
  );
  const eventIds = parsedEvents.data.flatMap((event) => event.id ? [event.id] : []);
  const duplicateEventIds = duplicateValues(eventIds);
  if (duplicateEventIds.length > 0) {
    issues.push({
      code: "duplicate_id",
      message: `duplicate event IDs: ${duplicateEventIds.join(", ")}`,
    });
  }
  const eventById = new Map(
    parsedEvents.data.flatMap((event) => event.id ? [[event.id, event] as const] : []),
  );

  for (const event of parsedEvents.data) {
    if (event.sourceActionId && !actionsById.has(event.sourceActionId)) {
      issues.push({
        code: "dangling_link",
        message: `event references unknown action ${event.sourceActionId}`,
      });
    } else if (
      event.sourceActionId &&
      event.actorSide &&
      actionsById.get(event.sourceActionId)?.actorSide !== event.actorSide
    ) {
      issues.push({
        code: "dangling_link",
        message: `event actor side conflicts with action ${event.sourceActionId}`,
      });
    }
  }

  if (parsedStatus.data !== "valid" && parsedEvidence.data.length > 0) {
    issues.push({
      code: "uncommitted_evidence",
      message: "rejected or unavailable mechanical evidence cannot enter a receipt",
    });
  }
  for (const evidence of parsedEvidence.data) {
    if (evidence.turn !== input.turn) {
      issues.push({
        code: "turn_mismatch",
        message: `mechanical evidence ${evidence.evidenceId} belongs to another turn`,
      });
    }
    if (evidence.sourceActionId && !actionsById.has(evidence.sourceActionId)) {
      issues.push({
        code: "dangling_link",
        message: `mechanical evidence references unknown action ${evidence.sourceActionId}`,
      });
    } else if (
      evidence.sourceActionId &&
      evidence.actorSide &&
      actionsById.get(evidence.sourceActionId)?.actorSide !== evidence.actorSide
    ) {
      issues.push({
        code: "dangling_link",
        message: `mechanical evidence actor side conflicts with action ${evidence.sourceActionId}`,
      });
    }
    const missingBasis = evidence.basisEventIds.filter((id) => !eventById.has(id));
    if (missingBasis.length > 0) {
      issues.push({
        code: "dangling_link",
        message: `mechanical evidence references unknown events: ${missingBasis.join(", ")}`,
      });
    }
    if (evidence.sourceActionId) {
      const conflictingBasis = evidence.basisEventIds.some((id) => {
        const basisActionId = eventById.get(id)?.sourceActionId;
        return basisActionId !== undefined && basisActionId !== evidence.sourceActionId;
      });
      if (conflictingBasis) {
        issues.push({
          code: "dangling_link",
          message: `mechanical evidence ${evidence.evidenceId} conflicts with its basis events`,
        });
      }
    }
  }

  const semantic = validateSemanticTransition({
    turn: input.turn,
    before: input.before,
    after: input.after,
    transition: input.semanticTransition,
    eventById,
  });
  issues.push(...semantic.issues);
  if (issues.length > 0) return { ok: false, issues };

  const sourceActionIds: string[] = [];
  const unattributedSourceEventIds: string[] = [];
  for (const eventId of semantic.patch?.sourceEventIds ?? []) {
    const actionId = eventById.get(eventId)?.sourceActionId;
    if (actionId) {
      if (!sourceActionIds.includes(actionId)) sourceActionIds.push(actionId);
    } else {
      unattributedSourceEventIds.push(eventId);
    }
  }
  const receipt = BattleTurnCausalReceiptSchema.parse({
    schemaVersion: 1,
    turn: input.turn,
    actions: parsedActions.data.map((action) => ({
      actionId: action.id,
      actorSide: action.actorSide,
      requested: action.resolution?.requested ?? null,
      effective: effectiveIntent(action),
      executed: action.executed,
      skippedReason: action.skippedReason,
      resolution: action.resolution
        ? {
            status: "known" as const,
            outcome: action.resolution.outcome,
            reason: action.resolution.reason,
          }
        : { status: "unknown" as const },
      events: parsedEvents.data.filter(
        (event) => event.sourceActionId === action.id,
      ),
      mechanicalEvidence: parsedEvidence.data.filter(
        (evidence) => evidence.sourceActionId === action.id,
      ),
    })),
    unlinkedEvents: parsedEvents.data.filter((event) => !event.sourceActionId),
    unlinkedMechanicalEvidence: parsedEvidence.data.filter(
      (evidence) => evidence.sourceActionId === null,
    ),
    semantic: {
      status: input.semanticTransition.status,
      fromRevision: input.semanticTransition.fromRevision,
      toRevision: input.semanticTransition.toRevision,
      acceptedChange: semantic.patch
        ? {
            sourceEventIds: semantic.patch.sourceEventIds,
            sourceActionIds,
            unattributedSourceEventIds,
            operations: semantic.patch.operations,
          }
        : null,
    },
    carryForward: [
      participantCarryForward("a", input.before, input.after),
      participantCarryForward("b", input.before, input.after),
    ],
  });
  return { ok: true, receipt: deepFreeze(structuredClone(receipt)) };
}

const SemanticChangeKindSchema = z.enum([
  "scene",
  "location",
  "presence",
  "condition",
  "visibility",
  "identity",
  "other",
]);

const NarrationCausalEventSchema = z.object({
  type: z.enum([
    "damage",
    "heal",
    "rest",
    "parameter",
    "defend",
    "wait",
    "reflect",
    "status",
    "situation",
    "info",
    "utterance",
    "free_action",
  ]),
  actorLabel: z.string().min(1).max(240).nullable(),
  targetLabels: z.array(z.string().min(1).max(240)).max(2),
  parameterKey: ParamKeySchema.optional(),
  parameterDirection: z.enum(["loss", "gain"]).optional(),
  intensity: z.enum(["minor", "moderate", "heavy", "critical"]).optional(),
}).strict();

const NarrationMechanicalConsequenceSchema = z.object({
  targetLabel: z.string().min(1).max(240),
  change: QualitativeMechanicalChangeSchema,
}).strict();

const NarrationCausalActionSchema = z.object({
  actorLabel: z.string().min(1).max(240),
  requestedKind: ActionKindSchema.nullable(),
  effectiveKind: ActionKindSchema,
  executed: z.boolean(),
  skippedReason: ActionExecutionSkipReasonSchema.nullable(),
  resolution: CausalActionResolutionSchema,
  events: z.array(NarrationCausalEventSchema).max(64),
  mechanicalConsequences: z.array(NarrationMechanicalConsequenceSchema).max(64),
  semanticChangeKinds: z.array(SemanticChangeKindSchema).max(7),
}).strict();

const NarrationReserveCueSchema = z.object({
  parameterKey: ReserveParameterKeySchema,
  absoluteBand: ReserveBandSchema,
  relativeBand: ReserveBandSchema,
}).strict();

const NarrationContinuingConditionSchema = z.object({
  participantLabel: z.string().min(1).max(240),
  canFight: z.boolean(),
  defending: z.boolean(),
  reserveCues: z.array(NarrationReserveCueSchema).max(12),
}).strict();

/** ID-free, raw-free input that may cross the narrator boundary. */
export const NarrationCausalProjectionSchema = z.object({
  schemaVersion: z.literal(1),
  turn: z.number().int().nonnegative(),
  causalChains: z.array(NarrationCausalActionSchema).max(2),
  observedConsequences: z.array(QuantizedChangeSchema).max(64),
  observedSemanticChangeKinds: z.array(SemanticChangeKindSchema).max(7),
  continuingConditions: z.array(NarrationContinuingConditionSchema).max(2),
}).strict();

export type NarrationCausalProjection = z.infer<
  typeof NarrationCausalProjectionSchema
>;

export type BuildNarrationCausalProjectionInput = {
  receipt: BattleTurnCausalReceipt;
  perception: NarrationPerceptionView;
  participantLabels: { a: string; b: string };
  publicObservation?: SemanticObservationState;
};

function safeParticipantLabel(label: string, side: "a" | "b"): string {
  const fallback = side === "a" ? "一方の人物" : "もう一方の人物";
  const trimmed = label.trim();
  if (!trimmed || /(?:character|turn-[0-9]+-(?:action|event|mechanical))[.:_-]/u.test(trimmed)) {
    return fallback;
  }
  return trimmed.slice(0, 240);
}

function semanticChangeKind(operation: SemanticPatchOperation): z.infer<
  typeof SemanticChangeKindSchema
> {
  const segments = operation.path.split("/").slice(1);
  if (segments[0] === "scene") return "scene";
  if (segments[0] !== "entities") return "other";
  if (segments.length === 2 || segments[2] === "active") return "presence";
  if (segments[2] === "location") return "location";
  if (segments[2] === "visibleTo") return "visibility";
  if (segments[2] === "label") return "identity";
  if (segments[2] === "facts") return "condition";
  return "other";
}

function uniqueSemanticKinds(
  operations: readonly SemanticPatchOperation[],
): Array<z.infer<typeof SemanticChangeKindSchema>> {
  return [...new Set(operations.map(semanticChangeKind))];
}

function projectedEvent(
  event: TurnEvent,
  labels: { a: string; b: string },
): z.infer<typeof NarrationCausalEventSchema> {
  return NarrationCausalEventSchema.parse({
    type: event.type,
    actorLabel: event.actorSide ? labels[event.actorSide] : null,
    targetLabels: (event.targetSides ?? []).map((side) => labels[side]),
    ...(event.parameterKey ? { parameterKey: event.parameterKey } : {}),
    ...(event.parameterDirection
      ? { parameterDirection: event.parameterDirection }
      : {}),
    ...(event.intensity ? { intensity: event.intensity } : {}),
  });
}

function receiptConditions(input: {
  receipt: BattleTurnCausalReceipt;
  labels: { a: string; b: string };
  sides: readonly ("a" | "b")[];
}): Array<z.infer<typeof NarrationContinuingConditionSchema>> {
  return input.sides.flatMap((side) => {
    const participant = input.receipt.carryForward.find(
      (candidate) => candidate.side === side,
    );
    if (!participant) return [];
    return [NarrationContinuingConditionSchema.parse({
      participantLabel: input.labels[side],
      canFight: participant.after.canFight,
      defending: participant.after.defending,
      reserveCues: participant.after.reserveCues.map((cue) => ({
        parameterKey: cue.parameterKey,
        absoluteBand: cue.absoluteBand,
        relativeBand: cue.relativeBand,
      })),
    })];
  });
}

function characterConditions(input: {
  receipt: BattleTurnCausalReceipt;
  perception: Extract<NarrationPerceptionView, { mode: "self" | "opponent" }>;
  labels: { a: string; b: string };
}): Array<z.infer<typeof NarrationContinuingConditionSchema>> {
  const side = input.perception.viewpointSide;
  const participant = input.receipt.carryForward.find(
    (candidate) => candidate.side === side,
  );
  if (!participant) return [];
  return [NarrationContinuingConditionSchema.parse({
    participantLabel: input.labels[side],
    canFight: participant.after.canFight,
    defending: participant.after.defending,
    reserveCues: input.perception.frame.reserveCues
      .filter((cue) => cue.subject.kind === "self")
      .map((cue) => ({
        parameterKey: cue.parameterKey,
        absoluteBand: cue.absoluteBand,
        relativeBand: cue.relativeBand,
      })),
  })];
}

/**
 * Remove provenance IDs and raw values while retaining only facts allowed by
 * the selected narrator perception. Character modes never receive a guessed
 * link from their observed changes back to another actor's private action.
 */
export function buildNarrationCausalProjection(
  input: BuildNarrationCausalProjectionInput,
): NarrationCausalProjection {
  const receipt = BattleTurnCausalReceiptSchema.parse(input.receipt);
  const perception = NarrationPerceptionViewSchema.parse(input.perception);
  const labels = {
    a: safeParticipantLabel(input.participantLabels.a, "a"),
    b: safeParticipantLabel(input.participantLabels.b, "b"),
  };
  const characterPerception = perception.mode === "self" ||
      perception.mode === "opponent"
    ? perception
    : null;
  const characterMode = characterPerception !== null;
  const viewpointSide = characterPerception?.viewpointSide ?? null;
  const actions = receipt.actions.filter(
    (action) => viewpointSide === null || action.actorSide === viewpointSide,
  );
  const acceptedChange = receipt.semantic.acceptedChange;
  const uniquelyAttributedSemanticActionId =
    perception.mode === "omniscient" &&
      acceptedChange?.sourceActionIds.length === 1 &&
      acceptedChange.unattributedSourceEventIds.length === 0
      ? acceptedChange.sourceActionIds[0]
      : null;

  const causalChains = actions.map((action) => {
    const mechanicalConsequences = characterMode
      ? []
      : quantizeCommittedMechanicalEvidence(action.mechanicalEvidence).map(
          (evidence) => ({
            targetLabel: labels[evidence.target.side],
            change: evidence.change,
          }),
        );
    return NarrationCausalActionSchema.parse({
      actorLabel: labels[action.actorSide],
      requestedKind: action.requested?.kind ?? null,
      effectiveKind: action.effective.kind,
      executed: action.executed,
      skippedReason: action.skippedReason,
      resolution: action.resolution,
      events: characterMode
        ? []
        : action.events.map((event) => projectedEvent(event, labels)),
      mechanicalConsequences,
      semanticChangeKinds:
        uniquelyAttributedSemanticActionId === action.actionId && acceptedChange
          ? uniqueSemanticKinds(acceptedChange.operations)
          : [],
    });
  });

  let observedConsequences: z.infer<typeof QuantizedChangeSchema>[] = [];
  if (characterPerception) {
    observedConsequences = characterPerception.frame.qualitativeChanges;
  } else {
    observedConsequences = quantizeCommittedMechanicalEvidence(
      receipt.unlinkedMechanicalEvidence,
    ).map((evidence) => ({
      ...evidence.change,
      sourceKnowledge: "unknown" as const,
      targetKnowledge: "identified" as const,
    }));
  }

  let observedSemanticChangeKinds: Array<z.infer<
    typeof SemanticChangeKindSchema
  >> = [];
  if (perception.mode === "external" && input.publicObservation) {
    const publicObservation = SemanticObservationStateSchema.parse(
      input.publicObservation,
    );
    observedSemanticChangeKinds = uniqueSemanticKinds(
      publicObservation.latestDiff.operations,
    );
  } else if (
    perception.mode === "omniscient" &&
    acceptedChange &&
    uniquelyAttributedSemanticActionId === null
  ) {
    observedSemanticChangeKinds = uniqueSemanticKinds(acceptedChange.operations);
  }

  const continuingConditions = characterPerception
    ? characterConditions({
        receipt,
        perception: characterPerception,
        labels,
      })
    : receiptConditions({ receipt, labels, sides: ["a", "b"] });
  const projection = NarrationCausalProjectionSchema.parse({
    schemaVersion: 1,
    turn: receipt.turn,
    causalChains,
    observedConsequences,
    observedSemanticChangeKinds,
    continuingConditions,
  });
  return deepFreeze(structuredClone(projection));
}
