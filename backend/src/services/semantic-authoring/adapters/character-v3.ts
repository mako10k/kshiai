import {
  CHARACTER_AUTHORING_ADAPTER_IDENTITY_V1,
  CHARACTER_CLUSTER_PROPOSAL_SCHEMA_V1,
  CHARACTER_LEDGER_PROPOSAL_SCHEMA_V1,
  CHARACTER_SKELETON_PROPOSAL_SCHEMA_V1,
  CharacterClusterPayloadV1Schema,
  CharacterDefinitionV2Schema,
  CharacterDefinitionV3Schema,
  CharacterLedgerPayloadV1Schema,
  CharacterSkeletonPayloadV1Schema,
  LEGACY_SPEECH_UNSPECIFIED,
  MigrationPreservationCapsuleV1Schema,
  characterOperationTargetKeyV1,
  createSemanticProposalV1Schema,
  defaultBasicAttack,
  defaultParameters,
  legacyCharacterSheetToDefinitionV2,
  type AdapterProgressObservationV1,
  type CharacterCandidateOperationV1,
  type CharacterDefinitionV3,
  type CharacterProposalPayloadV1,
  type MigrationPreservationCapsuleV1,
  type SemanticAuthoringAdapterV1,
  type SemanticAuthoringModeV1,
  type SemanticProposalV1,
  type SourceDispositionDecisionV1,
} from "@kshiai/shared";
import { createHash } from "node:crypto";

export type CharacterAuthoringSourceV1 =
  | Readonly<{ kind: "create"; naturalText: string }>
  | Readonly<{
      kind: "revise";
      definition: CharacterDefinitionV3;
      requestedCluster: "skeleton" | "mechanics" | "relationship-expression" | "appearance";
    }>
  | Readonly<{
      kind: "migrate";
      definition: unknown;
      capsule: MigrationPreservationCapsuleV1 | null;
    }>;

export type CharacterObligationV1 = Readonly<{
  obligationId: string;
  required: boolean;
  cluster: "skeleton" | "mechanics" | "relationship-expression" | "appearance" | "ledger";
  resolved: boolean;
}>;

export type CharacterFindingV1 = Readonly<{
  code: string;
  explanation: string;
}>;

export type CharacterWorkItemV1 =
  | Readonly<{
      kind: "skeleton";
      workItemId: string;
      skeletonRequiredClaimIds: readonly string[];
    }>
  | Readonly<{
      kind: "cluster";
      workItemId: string;
      cluster: "mechanics" | "relationship-expression" | "appearance";
    }>
  | Readonly<{
      kind: "ledger";
      workItemId: string;
      capsuleAvailable: boolean;
    }>;

export type CharacterProposalV1 = SemanticProposalV1<CharacterProposalPayloadV1>;

const PLACEHOLDER_NAME = "未設定";
const PLACEHOLDER_APPEARANCE = "未設定の外見";
const DEFAULT_BASIC_ACTION_NAME = "基本アクション";
const skeletonProposalSchema = createSemanticProposalV1Schema(
  CHARACTER_SKELETON_PROPOSAL_SCHEMA_V1,
  CharacterSkeletonPayloadV1Schema,
);
const clusterProposalSchema = createSemanticProposalV1Schema(
  CHARACTER_CLUSTER_PROPOSAL_SCHEMA_V1,
  CharacterClusterPayloadV1Schema,
);
const ledgerProposalSchema = createSemanticProposalV1Schema(
  CHARACTER_LEDGER_PROPOSAL_SCHEMA_V1,
  CharacterLedgerPayloadV1Schema,
);

const mechanicsOps = new Set([
  "set_action_semantics",
  "set_inventory_semantics",
  "upsert_action_norm",
  "remove_action_norm",
  "upsert_mechanical_fallback",
  "remove_mechanical_fallback",
]);
const relationshipOps = new Set([
  "upsert_relationship_seed",
  "remove_relationship_seed",
  "replace_speech_policy",
]);
const appearanceOps = new Set([
  "set_appearance_summary",
  "upsert_appearance_detail",
  "remove_appearance_detail",
  "set_visual_prompt",
  "set_expression_notes",
]);
const clusterOneOps = new Set([
  "replace_identity",
  "upsert_background",
  "remove_background",
  "replace_psyche_dynamics",
  "upsert_core_need",
  "remove_core_need",
  "upsert_tendency",
  "remove_tendency",
  "set_psyche_description",
  "upsert_conscious_guidance",
  "remove_conscious_guidance",
]);

function digestCandidate(candidate: CharacterDefinitionV3): string {
  return createHash("sha256").update(JSON.stringify({
    identity: candidate.identity.displayName,
    needs: candidate.psycheDisposition.coreNeeds.map((item) => item.id),
    appearance: candidate.appearance.publicSummary,
    findings: candidate.actionNorms.map((item) => item.id),
  })).digest("hex");
}

function upsert<T extends { id: string }>(items: readonly T[], value: T): T[] {
  const next = items.filter((item) => item.id !== value.id);
  next.push(value);
  return next;
}

function removeId<T extends { id: string }>(items: readonly T[], id: string): T[] | null {
  if (!items.some((item) => item.id === id)) {
    return null;
  }
  return items.filter((item) => item.id !== id);
}

function applyIdentityOperation(
  candidate: CharacterDefinitionV3,
  operation: CharacterCandidateOperationV1,
): CharacterDefinitionV3 | null {
  if (operation.op === "replace_identity") {
    return { ...candidate, identity: operation.value };
  }
  if (operation.op === "upsert_background") {
    return { ...candidate, profileBackground: upsert(candidate.profileBackground, operation.value) };
  }
  if (operation.op === "remove_background") {
    const profileBackground = removeId(candidate.profileBackground, operation.id);
    return profileBackground ? { ...candidate, profileBackground } : null;
  }
  return null;
}

function applyPsycheOperation(
  candidate: CharacterDefinitionV3,
  operation: CharacterCandidateOperationV1,
): CharacterDefinitionV3 | null {
  if (operation.op === "replace_psyche_dynamics") {
    return {
      ...candidate,
      psycheDisposition: { ...candidate.psycheDisposition, dynamics: operation.value },
    };
  }
  if (operation.op === "upsert_core_need") {
    return {
      ...candidate,
      psycheDisposition: {
        ...candidate.psycheDisposition,
        coreNeeds: upsert(candidate.psycheDisposition.coreNeeds, operation.value),
      },
    };
  }
  if (operation.op === "remove_core_need") {
    const coreNeeds = removeId(candidate.psycheDisposition.coreNeeds, operation.id);
    return coreNeeds
      ? { ...candidate, psycheDisposition: { ...candidate.psycheDisposition, coreNeeds } }
      : null;
  }
  if (operation.op === "upsert_tendency") {
    return {
      ...candidate,
      psycheDisposition: {
        ...candidate.psycheDisposition,
        tendencies: upsert(candidate.psycheDisposition.tendencies, operation.value),
      },
    };
  }
  if (operation.op === "remove_tendency") {
    const tendencies = removeId(candidate.psycheDisposition.tendencies, operation.id);
    return tendencies
      ? { ...candidate, psycheDisposition: { ...candidate.psycheDisposition, tendencies } }
      : null;
  }
  if (operation.op === "set_psyche_description") {
    return {
      ...candidate,
      psycheDisposition: { ...candidate.psycheDisposition, description: operation.value },
    };
  }
  if (operation.op === "upsert_conscious_guidance") {
    return { ...candidate, consciousGuidance: upsert(candidate.consciousGuidance, operation.value) };
  }
  if (operation.op === "remove_conscious_guidance") {
    const consciousGuidance = removeId(candidate.consciousGuidance, operation.id);
    return consciousGuidance ? { ...candidate, consciousGuidance } : null;
  }
  return null;
}

function applyMechanicsOperation(
  candidate: CharacterDefinitionV3,
  operation: CharacterCandidateOperationV1,
): CharacterDefinitionV3 | null {
  if (operation.op === "set_action_semantics") {
    if (candidate.capabilities.basicAction.id === operation.value.id) {
      return {
        ...candidate,
        capabilities: {
          ...candidate.capabilities,
          basicAction: { ...candidate.capabilities.basicAction, ...operation.value },
        },
      };
    }
    const skills = candidate.capabilities.skills.map((skill) =>
      skill.id === operation.value.id ? { ...skill, ...operation.value } : skill,
    );
    if (skills.every((skill, index) => skill === candidate.capabilities.skills[index])) {
      return null;
    }
    return { ...candidate, capabilities: { ...candidate.capabilities, skills } };
  }
  if (operation.op === "set_inventory_semantics") {
    const inventory = candidate.inventory.map((item) =>
      item.id === operation.value.id ? { ...item, ...operation.value } : item,
    );
    if (inventory.every((item, index) => item === candidate.inventory[index])) {
      return null;
    }
    return { ...candidate, inventory };
  }
  if (operation.op === "upsert_action_norm") {
    return { ...candidate, actionNorms: upsert(candidate.actionNorms, operation.value) };
  }
  if (operation.op === "remove_action_norm") {
    const actionNorms = removeId(candidate.actionNorms, operation.id);
    return actionNorms ? { ...candidate, actionNorms } : null;
  }
  if (operation.op === "upsert_mechanical_fallback") {
    return {
      ...candidate,
      mechanicalConflictFallbacks: upsert(candidate.mechanicalConflictFallbacks, operation.value),
    };
  }
  if (operation.op === "remove_mechanical_fallback") {
    const mechanicalConflictFallbacks = removeId(
      candidate.mechanicalConflictFallbacks,
      operation.id,
    );
    return mechanicalConflictFallbacks ? { ...candidate, mechanicalConflictFallbacks } : null;
  }
  return null;
}

function applyRelationAppearanceOperation(
  candidate: CharacterDefinitionV3,
  operation: CharacterCandidateOperationV1,
): CharacterDefinitionV3 | null {
  if (operation.op === "upsert_relationship_seed") {
    return { ...candidate, relationshipSeeds: upsert(candidate.relationshipSeeds, operation.value) };
  }
  if (operation.op === "remove_relationship_seed") {
    const relationshipSeeds = removeId(candidate.relationshipSeeds, operation.id);
    return relationshipSeeds ? { ...candidate, relationshipSeeds } : null;
  }
  if (operation.op === "replace_speech_policy") {
    return { ...candidate, speechPolicy: operation.value };
  }
  if (operation.op === "set_appearance_summary") {
    return { ...candidate, appearance: { ...candidate.appearance, publicSummary: operation.value } };
  }
  if (operation.op === "upsert_appearance_detail") {
    return {
      ...candidate,
      appearance: {
        ...candidate.appearance,
        details: upsert(candidate.appearance.details, operation.value),
      },
    };
  }
  if (operation.op === "remove_appearance_detail") {
    const details = removeId(candidate.appearance.details, operation.id);
    return details ? { ...candidate, appearance: { ...candidate.appearance, details } } : null;
  }
  if (operation.op === "set_visual_prompt") {
    return { ...candidate, appearance: { ...candidate.appearance, visualPrompt: operation.value } };
  }
  if (operation.op === "set_expression_notes") {
    return { ...candidate, expressionNotes: operation.value };
  }
  return null;
}

function applyOperation(
  candidate: CharacterDefinitionV3,
  operation: CharacterCandidateOperationV1,
): CharacterDefinitionV3 | null {
  if (
    operation.op === "replace_identity"
    || operation.op === "upsert_background"
    || operation.op === "remove_background"
  ) {
    return applyIdentityOperation(candidate, operation);
  }
  if (
    operation.op === "replace_psyche_dynamics"
    || operation.op === "upsert_core_need"
    || operation.op === "remove_core_need"
    || operation.op === "upsert_tendency"
    || operation.op === "remove_tendency"
    || operation.op === "set_psyche_description"
    || operation.op === "upsert_conscious_guidance"
    || operation.op === "remove_conscious_guidance"
  ) {
    return applyPsycheOperation(candidate, operation);
  }
  if (
    operation.op === "set_action_semantics"
    || operation.op === "set_inventory_semantics"
    || operation.op === "upsert_action_norm"
    || operation.op === "remove_action_norm"
    || operation.op === "upsert_mechanical_fallback"
    || operation.op === "remove_mechanical_fallback"
  ) {
    return applyMechanicsOperation(candidate, operation);
  }
  return applyRelationAppearanceOperation(candidate, operation);
}

function operationsMatchCluster(
  cluster: "mechanics" | "relationship-expression" | "appearance",
  operations: readonly CharacterCandidateOperationV1[],
): boolean {
  const allowed = cluster === "mechanics"
    ? mechanicsOps
    : cluster === "relationship-expression"
      ? relationshipOps
      : appearanceOps;
  return operations.every((operation) => allowed.has(operation.op));
}

function scaffoldCharacterV3(): CharacterDefinitionV3 {
  const v2 = legacyCharacterSheetToDefinitionV2({
    id: "character-scaffold",
    ownerUserId: "owner",
    displayName: PLACEHOLDER_NAME,
    tags: [],
    createdAt: "2026-09-12T00:00:00.000Z",
    updatedAt: "2026-09-12T00:00:00.000Z",
    appearance: { summary: "未設定の外見", visualPrompt: "unspecified" },
    traits: [],
    parameters: defaultParameters(),
    skills: [],
    basicAttack: defaultBasicAttack(),
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "未設定",
  });
  const { schemaVersion: _schemaVersion, actionNorms: _actionNorms, ...stable } = v2;
  return CharacterDefinitionV3Schema.parse({
    ...stable,
    schemaVersion: 3,
    actionNorms: [],
    consciousGuidance: [],
    mechanicalConflictFallbacks: [],
  });
}

function v2ToCharacterV3(definition: unknown): CharacterDefinitionV3 | null {
  const parsed = CharacterDefinitionV2Schema.safeParse(definition);
  if (!parsed.success) {
    return null;
  }
  const { schemaVersion: _schemaVersion, actionNorms: _actionNorms, ...stable } = parsed.data;
  const converted = CharacterDefinitionV3Schema.safeParse({
    ...stable,
    schemaVersion: 3,
    actionNorms: [],
    consciousGuidance: [],
    mechanicalConflictFallbacks: [],
  });
  return converted.success ? converted.data : null;
}

function obligation(
  obligationId: string,
  cluster: CharacterObligationV1["cluster"],
  resolved: boolean,
): CharacterObligationV1 {
  return { obligationId, cluster, resolved, required: true };
}

function claimIsResolved(candidate: CharacterDefinitionV3, obligationId: string): boolean {
  if (obligationId === "identity") {
    return candidate.identity.displayName !== PLACEHOLDER_NAME;
  }
  if (obligationId === "psycheDisposition:coreNeeds") {
    return candidate.psycheDisposition.coreNeeds.length > 0;
  }
  if (obligationId.startsWith("capabilities:actions:")) {
    return candidate.capabilities.basicAction.name !== DEFAULT_BASIC_ACTION_NAME;
  }
  if (obligationId === "relationshipSeeds") {
    return candidate.relationshipSeeds.length > 0;
  }
  if (obligationId === "mechanics") {
    return candidate.actionNorms.length > 0;
  }
  if (obligationId === "relationship-expression") {
    return candidate.speechPolicy.register !== LEGACY_SPEECH_UNSPECIFIED
      && candidate.speechPolicy.register.length > 0;
  }
  if (obligationId === "appearance") {
    return candidate.appearance.publicSummary !== PLACEHOLDER_APPEARANCE;
  }
  return false;
}

function refreshClaimObligations(
  candidate: CharacterDefinitionV3,
  obligations: ReadonlyMap<string, CharacterObligationV1>,
): Map<string, CharacterObligationV1> {
  const next = new Map(obligations);
  for (const [id, item] of next) {
    if (item.cluster === "ledger") {
      continue;
    }
    next.set(id, { ...item, resolved: claimIsResolved(candidate, id) });
  }
  return next;
}

function registeredClaimAllows(registered: readonly string[], targetKey: string): boolean {
  return registered.some((id) => targetKey === id || targetKey.startsWith(`${id}:`));
}

function keyBelongsToCluster(
  key: string,
  cluster: "mechanics" | "relationship-expression" | "appearance",
): boolean {
  if (cluster === "mechanics") {
    return key === "mechanics"
      || key.startsWith("actionNorms:")
      || key.startsWith("mechanicalConflictFallbacks:")
      || key.startsWith("capabilities:actions:")
      || key.startsWith("inventory:");
  }
  if (cluster === "relationship-expression") {
    return key === "relationship-expression"
      || key === "speechPolicy"
      || key.startsWith("relationshipSeeds:");
  }
  return key === "appearance"
    || key === "expressionNotes"
    || key.startsWith("appearance:");
}

function originalRepairErrorKeys(
  cluster: "mechanics" | "relationship-expression" | "appearance",
  obligations: ReadonlyMap<string, CharacterObligationV1>,
  findings: ReadonlyMap<string, CharacterFindingV1>,
): readonly string[] {
  const keys = new Set<string>();
  for (const [id, item] of obligations) {
    if (item.cluster === cluster && !item.resolved) {
      keys.add(id);
    }
  }
  for (const key of findings.keys()) {
    if (keyBelongsToCluster(key, cluster)) {
      keys.add(key);
    }
  }
  if (keys.has("mechanics")) {
    keys.add("actionNorms");
  }
  if (keys.has("relationship-expression")) {
    keys.add("speechPolicy");
  }
  if (keys.has("appearance")) {
    keys.add("appearance:publicSummary");
  }
  return [...keys];
}

function mechanicsDependants(candidate: CharacterDefinitionV3, errorKey: string): readonly string[] {
  if (errorKey.startsWith("actionNorms:")) {
    const norm = candidate.actionNorms.find((item) => item.id === errorKey.slice("actionNorms:".length));
    return (norm?.response.actionRefs ?? []).map((ref) => `capabilities:actions:${ref}`);
  }
  if (errorKey.startsWith("mechanicalConflictFallbacks:")) {
    const fallback = candidate.mechanicalConflictFallbacks.find(
      (item) => item.id === errorKey.slice("mechanicalConflictFallbacks:".length),
    );
    return (fallback?.orderedActionRefs ?? []).map((ref) => `capabilities:actions:${ref}`);
  }
  if (!errorKey.startsWith("capabilities:actions:")) {
    return [];
  }
  const actionId = errorKey.slice("capabilities:actions:".length);
  return [
    ...candidate.actionNorms
      .filter((norm) => norm.response.actionRefs.includes(actionId))
      .map((norm) => `actionNorms:${norm.id}`),
    ...candidate.mechanicalConflictFallbacks
      .filter((fallback) => fallback.orderedActionRefs.includes(actionId))
      .map((fallback) => `mechanicalConflictFallbacks:${fallback.id}`),
  ];
}

function expressionDependants(candidate: CharacterDefinitionV3, errorKey: string): readonly string[] {
  if (errorKey.startsWith("relationshipSeeds:")) {
    return ["speechPolicy"];
  }
  if (errorKey === "speechPolicy") {
    return candidate.relationshipSeeds.map((seed) => `relationshipSeeds:${seed.id}`);
  }
  return [];
}

function appearanceDependants(errorKey: string): readonly string[] {
  if (errorKey.startsWith("appearance:details:")) {
    return ["appearance:publicSummary", "appearance:visualPrompt"];
  }
  if (errorKey === "appearance:publicSummary") {
    return ["appearance:visualPrompt"];
  }
  if (errorKey === "appearance:visualPrompt" || errorKey === "expressionNotes") {
    return ["appearance:publicSummary"];
  }
  return [];
}

function registeredDependantsOf(
  cluster: "mechanics" | "relationship-expression" | "appearance",
  candidate: CharacterDefinitionV3,
  errorKey: string,
): readonly string[] {
  if (cluster === "mechanics") {
    return mechanicsDependants(candidate, errorKey);
  }
  if (cluster === "relationship-expression") {
    return expressionDependants(candidate, errorKey);
  }
  return appearanceDependants(errorKey);
}

function registeredRepairClosure(
  cluster: "mechanics" | "relationship-expression" | "appearance",
  candidate: CharacterDefinitionV3,
  obligations: ReadonlyMap<string, CharacterObligationV1>,
  findings: ReadonlyMap<string, CharacterFindingV1>,
): Readonly<{ errorKeys: readonly string[]; registered: readonly string[] }> {
  const errorKeys = originalRepairErrorKeys(cluster, obligations, findings);
  const registered = new Set(errorKeys);
  for (const errorKey of errorKeys) {
    for (const dependant of registeredDependantsOf(cluster, candidate, errorKey)) {
      registered.add(dependant);
    }
  }
  return { errorKeys, registered: [...registered] };
}

function baselineObligations(
  candidate: CharacterDefinitionV3,
  mode: SemanticAuthoringModeV1,
  requestedCluster?: "skeleton" | "mechanics" | "relationship-expression" | "appearance",
): Map<string, CharacterObligationV1> {
  const basicId = candidate.capabilities.basicAction.id;
  const required = [
    obligation("identity", "skeleton", claimIsResolved(candidate, "identity")),
    obligation("psycheDisposition:coreNeeds", "skeleton", claimIsResolved(candidate, "psycheDisposition:coreNeeds")),
    obligation(`capabilities:actions:${basicId}`, "skeleton", claimIsResolved(candidate, `capabilities:actions:${basicId}`)),
    obligation("relationshipSeeds", "skeleton", claimIsResolved(candidate, "relationshipSeeds")),
    obligation("mechanics", "mechanics", claimIsResolved(candidate, "mechanics")),
    obligation("relationship-expression", "relationship-expression", claimIsResolved(candidate, "relationship-expression")),
    obligation("appearance", "appearance", claimIsResolved(candidate, "appearance")),
    obligation("lens:compiler", "ledger", false),
    obligation("lens:disclosure", "ledger", false),
    obligation("lens:cross-reference", "ledger", false),
  ];
  if (mode === "migrate") {
    required.push(obligation("source-disposition", "ledger", false));
  }
  const map = new Map(required.map((item) => [item.obligationId, item]));
  if (mode === "revise" && requestedCluster) {
    for (const [id, item] of map) {
      if (item.cluster === requestedCluster) {
        map.set(id, { ...item, resolved: false });
      } else if (item.cluster !== "ledger" && item.cluster !== "skeleton") {
        map.set(id, { ...item, resolved: true });
      }
    }
  }
  return map;
}

function skeletonRequiredClaimIds(candidate: CharacterDefinitionV3): readonly string[] {
  return [
    "identity",
    "psycheDisposition:coreNeeds",
    `capabilities:actions:${candidate.capabilities.basicAction.id}`,
    "relationshipSeeds",
  ];
}

function skeletonComplete(obligations: ReadonlyMap<string, CharacterObligationV1>): boolean {
  return [...obligations.values()]
    .filter((item) => item.cluster === "skeleton" && item.required)
    .every((item) => item.resolved);
}

function decodeCharacterSource(value: unknown) {
  if (typeof value !== "object" || value === null || !("kind" in value)) {
    return { accepted: false as const };
  }
  if (value.kind === "create" && "naturalText" in value && typeof value.naturalText === "string") {
    return { accepted: true as const, value: { kind: "create" as const, naturalText: value.naturalText } };
  }
  if (value.kind === "revise" && "definition" in value && "requestedCluster" in value) {
    const parsed = CharacterDefinitionV3Schema.safeParse(value.definition);
    const requested = value.requestedCluster;
    const cluster = requested === "skeleton"
      ? "skeleton" as const
      : requested === "mechanics"
        ? "mechanics" as const
        : requested === "relationship-expression"
          ? "relationship-expression" as const
          : requested === "appearance"
            ? "appearance" as const
            : null;
    return parsed.success && cluster !== null
      ? {
          accepted: true as const,
          value: {
            kind: "revise" as const,
            definition: parsed.data,
            requestedCluster: cluster,
          },
        }
      : { accepted: false as const };
  }
  if (value.kind === "migrate" && "definition" in value) {
    const parsed = CharacterDefinitionV2Schema.safeParse(value.definition);
    if (!parsed.success) {
      return { accepted: false as const };
    }
    const capsuleValue = "capsule" in value ? value.capsule : null;
    const capsule = capsuleValue == null
      ? null
      : MigrationPreservationCapsuleV1Schema.safeParse(capsuleValue);
    if (capsuleValue != null && (capsule === null || !capsule.success)) {
      return { accepted: false as const };
    }
    return {
      accepted: true as const,
      value: {
        kind: "migrate" as const,
        definition: parsed.data,
        capsule: capsule && capsule.success ? capsule.data : null,
      },
    };
  }
  return { accepted: false as const };
}

function selectCharacterWork(
  state: Readonly<{
    candidate: CharacterDefinitionV3;
    obligations: ReadonlyMap<string, CharacterObligationV1>;
  }>,
) {
  if (!skeletonComplete(state.obligations)) {
    return {
      selected: true as const,
      workItem: {
        kind: "skeleton" as const,
        workItemId: "work-skeleton",
        skeletonRequiredClaimIds: skeletonRequiredClaimIds(state.candidate),
      },
    };
  }
  const remaining = [...state.obligations.values()].find((item) => item.required && !item.resolved);
  if (!remaining || remaining.cluster === "skeleton") {
    return { selected: false as const };
  }
  if (remaining.cluster === "ledger") {
    return {
      selected: true as const,
      workItem: {
        kind: "ledger" as const,
        workItemId: "work-ledger",
        capsuleAvailable: state.obligations.has("source-disposition"),
      },
    };
  }
  return {
    selected: true as const,
    workItem: {
      kind: "cluster" as const,
      workItemId: `work-${remaining.cluster}`,
      cluster: remaining.cluster,
    },
  };
}

function describeCharacterCapabilities(work: CharacterWorkItemV1) {
  const identity = work.kind === "skeleton"
    ? CHARACTER_SKELETON_PROPOSAL_SCHEMA_V1
    : work.kind === "cluster"
      ? CHARACTER_CLUSTER_PROPOSAL_SCHEMA_V1
      : CHARACTER_LEDGER_PROPOSAL_SCHEMA_V1;
  return {
    skill: {
      identity,
      objective: work.kind === "skeleton"
        ? "Establish the character skeleton."
        : "Complete the focused cluster.",
      phase: work.kind,
      legalCapabilityRoles: ["query-context" as const, "propose-change" as const],
      capabilityRequestGuidance: "Propose focused operations only.",
      resourceReminder: "Stay inside the frozen attempt budget.",
      disclosureReminder: work.kind === "ledger" && work.capsuleAvailable
        ? "Preservation capsule is available only for this migration work item."
        : "Do not request whole-candidate or preservation context.",
    },
    allowedSelectors: work.kind === "ledger" && work.capsuleAvailable
      ? ["source-claims", "findings", "preservation-capsule"]
      : ["source-claims", "findings"],
    proposalSchemaIdentity: identity,
    writeClosure: work.kind === "skeleton" ? [...work.skeletonRequiredClaimIds] : [work.kind],
  };
}

function decodeCharacterProposal(work: CharacterWorkItemV1, value: unknown) {
  const schema = work.kind === "skeleton"
    ? skeletonProposalSchema
    : work.kind === "cluster"
      ? clusterProposalSchema
      : ledgerProposalSchema;
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return { accepted: false as const };
  }
  const payload = parsed.data.payload;
  if (
    work.kind === "cluster"
    && (payload.kind === "complete_cluster" || payload.kind === "repair_cluster")
    && payload.cluster !== work.cluster
  ) {
    return { accepted: false as const };
  }
  return { accepted: true as const, value: parsed.data };
}

function runCharacterLens(
  lens: "source-consistency" | "cross-reference" | "authority" | "disclosure" | "compiler",
  candidate: CharacterDefinitionV3,
): "pass" | "repair-required" {
  if (lens === "compiler") {
    return CharacterDefinitionV3Schema.safeParse(candidate).success ? "pass" : "repair-required";
  }
  if (lens === "source-consistency") {
    return candidate.identity.displayName === PLACEHOLDER_NAME ? "repair-required" : "pass";
  }
  if (lens === "disclosure") {
    return candidate.appearance.publicSummary.length > 0 ? "pass" : "repair-required";
  }
  if (lens === "authority") {
    return candidate.combat.parameters ? "pass" : "repair-required";
  }
  const actionIds = new Set([
    candidate.capabilities.basicAction.id,
    ...candidate.capabilities.skills.map((skill) => skill.id),
  ]);
  const itemIds = new Set(candidate.inventory.map((item) => item.id));
  const unknownActions = candidate.actionNorms.some((norm) =>
    norm.response.actionRefs.some((ref) => !actionIds.has(ref)),
  );
  const unknownLoadout = candidate.initialLoadout.some((entry) => !itemIds.has(entry.itemId));
  return unknownActions || unknownLoadout ? "repair-required" : "pass";
}

function resolveObligation(
  obligations: ReadonlyMap<string, CharacterObligationV1>,
  obligationId: string,
): Map<string, CharacterObligationV1> {
  const next = new Map(obligations);
  const current = next.get(obligationId);
  if (current) {
    next.set(obligationId, { ...current, resolved: true });
  }
  return next;
}

function stageLedgerProposal(
  input: Readonly<{
    candidate: CharacterDefinitionV3;
    obligations: ReadonlyMap<string, CharacterObligationV1>;
    findings: ReadonlyMap<string, CharacterFindingV1>;
    proposal: CharacterProposalV1;
  }>,
) {
  const payload = input.proposal.payload;
  if (payload.kind === "classify_source_disposition") {
    const sourceDispositions = new Map<string, SourceDispositionDecisionV1>();
    for (const decision of payload.decisions) {
      sourceDispositions.set(decision.sourceClaimId, decision);
    }
    const covered = sourceDispositions.has("identity.displayName")
      || sourceDispositions.size > 0;
    return {
      accepted: true as const,
      candidate: input.candidate,
      obligations: covered
        ? resolveObligation(input.obligations, "source-disposition")
        : input.obligations,
      findings: input.findings,
      sourceDispositions,
    };
  }
  if (payload.kind === "propose_deferral") {
    return {
      accepted: true as const,
      candidate: input.candidate,
      obligations: input.obligations,
      findings: input.findings,
    };
  }
  if (payload.kind !== "submit_lens_review") {
    return null;
  }
  const serverVerdict = runCharacterLens(payload.lens, input.candidate);
  const findings = new Map(input.findings);
  if (payload.verdict !== serverVerdict) {
    findings.set(`lens:${payload.lens}`, {
      code: "lens-disagreement",
      explanation: `server ${serverVerdict} disagrees with submitted ${payload.verdict}`,
    });
  }
  return {
    accepted: true as const,
    candidate: input.candidate,
    obligations: serverVerdict === "pass"
      ? resolveObligation(input.obligations, `lens:${payload.lens}`)
      : input.obligations,
    findings,
  };
}

function rejectUnregisteredRepair(
  cluster: "mechanics" | "relationship-expression" | "appearance",
  input: Readonly<{
    candidate: CharacterDefinitionV3;
    obligations: ReadonlyMap<string, CharacterObligationV1>;
    findings: ReadonlyMap<string, CharacterFindingV1>;
    proposal: CharacterProposalV1;
  }>,
  operations: readonly CharacterCandidateOperationV1[],
) {
  const closure = registeredRepairClosure(
    cluster,
    input.candidate,
    input.obligations,
    input.findings,
  );
  const declared = input.proposal.declaredSemanticDependantIds;
  for (const dependant of declared) {
    if (!registeredClaimAllows(closure.registered, dependant)) {
      return {
        accepted: false as const,
        findingKey: "repair-closure",
        finding: { code: "repair-closure", explanation: `${dependant} is not a registered dependant` },
      };
    }
  }
  for (const operation of operations) {
    const key = characterOperationTargetKeyV1(operation);
    if (registeredClaimAllows(closure.errorKeys, key)) {
      continue;
    }
    if (!registeredClaimAllows(closure.registered, key) || !declared.includes(key)) {
      return {
        accepted: false as const,
        findingKey: "repair-closure",
        finding: { code: "repair-closure", explanation: `${key} is outside the repair closure` },
      };
    }
  }
  return null;
}

function stageCharacterProposal(
  input: Readonly<{
    candidate: CharacterDefinitionV3;
    obligations: ReadonlyMap<string, CharacterObligationV1>;
    findings: ReadonlyMap<string, CharacterFindingV1>;
    proposal: CharacterProposalV1;
  }>,
) {
  const ledger = stageLedgerProposal(input);
  if (ledger) {
    return ledger;
  }
  const payload = input.proposal.payload;
  if (
    payload.kind === "classify_source_disposition"
    || payload.kind === "propose_deferral"
    || payload.kind === "submit_lens_review"
  ) {
    return {
      accepted: false as const,
      findingKey: "ledger",
      finding: { code: "ledger", explanation: "ledger proposal was not staged" },
    };
  }
  const operations = payload.operations;
  if (payload.kind === "set_skeleton") {
    const registered = skeletonRequiredClaimIds(input.candidate);
    for (const operation of operations) {
      const key = characterOperationTargetKeyV1(operation);
      if (!clusterOneOps.has(operation.op) && !registeredClaimAllows(registered, key)) {
        return {
          accepted: false as const,
          findingKey: "skeleton-closure",
          finding: { code: "skeleton-closure", explanation: `cross-cluster ${key} is not registered` },
        };
      }
    }
  }
  if (
    (payload.kind === "complete_cluster" || payload.kind === "repair_cluster")
    && !operationsMatchCluster(payload.cluster, operations)
  ) {
    return {
      accepted: false as const,
      findingKey: "cluster-mismatch",
      finding: { code: "cluster-mismatch", explanation: "operation outside named cluster" },
    };
  }
  if (payload.kind === "repair_cluster") {
    const rejected = rejectUnregisteredRepair(
      payload.cluster,
      input,
      operations,
    );
    if (rejected) {
      return rejected;
    }
  }
  let candidate = input.candidate;
  const portrait = candidate.appearance.portrait;
  const combat = candidate.combat;
  for (const operation of operations) {
    const next = applyOperation(candidate, operation);
    if (!next) {
      return {
        accepted: false as const,
        findingKey: "stage",
        finding: { code: "stage", explanation: `cannot apply ${operation.op}` },
      };
    }
    candidate = next;
  }
  if (
    JSON.stringify(candidate.appearance.portrait) !== JSON.stringify(portrait)
    || JSON.stringify(candidate.combat) !== JSON.stringify(combat)
  ) {
    return {
      accepted: false as const,
      findingKey: "protected-mechanics",
      finding: { code: "protected-mechanics", explanation: "portrait and combat are not model-writable" },
    };
  }
  return {
    accepted: true as const,
    candidate,
    obligations: refreshClaimObligations(candidate, input.obligations),
    findings: input.findings,
  };
}

function finalizeCharacterCandidate(
  input: Readonly<{
    candidate: CharacterDefinitionV3;
    obligations: ReadonlyMap<string, CharacterObligationV1>;
    findings: ReadonlyMap<string, CharacterFindingV1>;
  }>,
) {
  const findings = new Map(input.findings);
  let obligations = refreshClaimObligations(input.candidate, input.obligations);
  const lenses = ["compiler", "disclosure", "cross-reference", "source-consistency", "authority"] as const;
  for (const lens of lenses) {
    if (runCharacterLens(lens, input.candidate) === "pass") {
      obligations = resolveObligation(obligations, `lens:${lens}`);
    } else {
      findings.set(`lens:${lens}`, {
        code: "lens-failed",
        explanation: `${lens} repair required`,
      });
    }
  }
  const parsed = CharacterDefinitionV3Schema.safeParse(input.candidate);
  const unresolved = [...obligations.values()].filter((item) => item.required && !item.resolved);
  if (!parsed.success || unresolved.length > 0 || findings.size > 0) {
    if (!findings.has("incomplete") && unresolved.length > 0) {
      findings.set("incomplete", { code: "incomplete", explanation: "required claims remain unresolved" });
    }
    return { accepted: false as const, findings };
  }
  return {
    accepted: true as const,
    finalCandidate: parsed.data,
    finalCandidateDigest: digestCandidate(parsed.data),
    obligationCoverage: {
      resolvedRequiredObligationCount: [...obligations.values()].filter((item) => item.required && item.resolved).length,
      requiredObligationCount: [...obligations.values()].filter((item) => item.required).length,
    },
    reconciliationReceiptIdentity: "character-reconciliation-v1",
    compilerReceiptIdentity: "character-compiler-v3",
    disclosureReceiptIdentity: "character-disclosure-v1",
  };
}

export function createCharacterSemanticAuthoringAdapterV3(): SemanticAuthoringAdapterV1<
  CharacterAuthoringSourceV1,
  CharacterDefinitionV3,
  CharacterObligationV1,
  CharacterWorkItemV1,
  CharacterProposalV1,
  CharacterFindingV1,
  string,
  string,
  CharacterDefinitionV3
> {
  return {
    identity: CHARACTER_AUTHORING_ADAPTER_IDENTITY_V1,
    decodeFrozenSource: decodeCharacterSource,
    buildBaseline(source, mode) {
      const candidate = source.kind === "revise"
        ? source.definition
        : source.kind === "migrate"
          ? v2ToCharacterV3(source.definition) ?? scaffoldCharacterV3()
          : scaffoldCharacterV3();
      return {
        candidate,
        obligations: baselineObligations(
          candidate,
          mode,
          source.kind === "revise" ? source.requestedCluster : undefined,
        ),
      };
    },
    selectWork: selectCharacterWork,
    describeCapabilities: describeCharacterCapabilities,
    decodeProposal: decodeCharacterProposal,
    stageProposal: stageCharacterProposal,
    reconcileAffected(input) {
      return { findings: input.findings };
    },
    observeProgress(input) {
      const resolved = [...input.obligations.values()].filter((item) => item.required && item.resolved).length;
      const digest = digestCandidate(input.candidate);
      const findingKeys = [...input.findings.keys()];
      const previous = input.previous;
      const materialProgress = previous
        ? resolved > previous.resolvedRequiredObligationCount
          || findingKeys.length < previous.unresolvedMaterialFindingKeys.length
          || digest !== previous.relevantStateDigest
        : false;
      const observation: AdapterProgressObservationV1 = {
        phase: input.phase,
        resolvedRequiredObligationCount: resolved,
        coveredMaterialClaimCount: resolved,
        unresolvedMaterialFindingKeys: findingKeys,
        relevantStateDigest: digest,
        activeSemanticClusterKey: input.phase,
        materialProgress,
      };
      return observation;
    },
    assessQuestion() {
      return { ask: false };
    },
    applyAnswer() {
      return { questionId: "question-1", affectedClaimIds: [] };
    },
    finalize: finalizeCharacterCandidate,
  };
}
