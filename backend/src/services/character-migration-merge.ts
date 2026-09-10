import {
  CHARACTER_MIGRATION_CAPSULE_MAX_BYTES,
  type CharacterDeferredValueV1,
  type CharacterMigrationFinding,
  type CharacterMigrationJson,
  type CharacterMigrationOwnerDiff,
  type CharacterSemanticMigrationChangeSetV1,
  type CharacterSemanticMigrationOperationV1,
  type MigrationPreservationCapsuleV1,
} from "@kshiai/shared";
import { assetContentDigest, canonicalAssetJson } from "../repositories/asset-generations.js";
import {
  CHARACTER_MIGRATION_PROMPT_V3, characterMigrationRepairClosure, migrationRead, migrationTargetPaths,
  migrationWrite, pathContains, type CharacterMigrationContext,
} from "./character-migration-context.js";
import { rejectedCharacterMigrationFragmentFindings } from "./character-migration-diagnostics.js";

export type AppliedMigrationOperation = CharacterSemanticMigrationOperationV1 & {
  operationId: string;
};
export type CharacterMigrationMerge = {
  candidate: CharacterMigrationJson;
  operations: AppliedMigrationOperation[];
  findings: CharacterMigrationFinding[];
  deferred: CharacterDeferredValueV1[];
  uncertainties: string[];
};

export function migrationFinding(code: string, path: string, explanation: string):
CharacterMigrationFinding {
  return { code, targetPaths: [path], sourcePaths: [], explanation, semanticDependants: [] };
}

export function initialCharacterMigrationMerge(
  context: CharacterMigrationContext,
): CharacterMigrationMerge {
  return { candidate: structuredClone(context.baseline), operations: [],
    findings: [], deferred: [], uncertainties: [] };
}

type OperationPathInput = {
  context: CharacterMigrationContext;
  candidate: CharacterMigrationJson;
  operation: CharacterSemanticMigrationOperationV1;
  closure: string[] | null;
};

function retirementTargetValid(
  operation: CharacterSemanticMigrationOperationV1, context: CharacterMigrationContext,
): boolean {
  return !(!context.sourcePaths.includes(operation.targetPath) ||
      !operation.sourcePaths.includes(operation.targetPath) ||
      !operation.targetPath.startsWith("definition.") ||
      operation.targetPath === "definition.schemaVersion");
}

function repairScopeValid(input: OperationPathInput, registered: string[]): boolean {
  const { operation, candidate, closure } = input;
  if (!closure) return true;
  const permitted = characterMigrationRepairClosure(
    [...closure, ...operation.semanticDependants], candidate,
  );
  const touched = [operation.targetPath, ...(operation.operation === "move" ?
    operation.sourcePaths.filter((path) => registered.includes(path)) : [])];
  return touched.every((target) => permitted.some((path) => pathContains(path, target)));
}

function checkOperationPaths(input: OperationPathInput): string | null {
  const { context, candidate, operation } = input;
  if (operation.sourcePaths.some((path) => !context.sourcePaths.includes(path))) {
    return "unregistered source path";
  }
  const registered = migrationTargetPaths(candidate);
  if (operation.operation === "retire_to_capsule") {
    if (!retirementTargetValid(operation, context)) return "retirement must identify its exact source target";
  } else if (!registered.includes(operation.targetPath)) return "unregistered target path";
  if (operation.semanticDependants.some((path) => !registered.includes(path))) return "unregistered semantic dependant";
  if (!repairScopeValid(input, registered)) return "repair target outside declared dependency closure";
  if (operation.deferred?.candidateSourcePaths.some((path) =>
    !context.sourcePaths.includes(path))) return "unregistered deferred source";
  if (operation.operation === "copy" &&
      operation.sourcePaths[0] !== operation.targetPath) return "use move for a changed role/path";
  return null;
}

function applyOperation(
  state: CharacterMigrationMerge, operation: AppliedMigrationOperation,
  context: CharacterMigrationContext,
): void {
  if (operation.operation === "retire_to_capsule") {
    const current = migrationRead(state.candidate, operation.targetPath);
    if (current !== undefined) migrationWrite(state.candidate, operation.targetPath,
      Array.isArray(current) ? [] : null);
    return;
  }
  state.deferred = state.deferred.filter((entry) =>
    !pathContains(operation.targetPath, entry.targetPath));
  if (operation.deferred) {
    state.deferred.push(operation.deferred);
    return;
  }
  const value = ["copy", "move"].includes(operation.operation)
    ? migrationRead(context.sources, operation.sourcePaths[0])
    : operation.value;
  if (value === undefined) throw new Error("source value unavailable");
  migrationWrite(state.candidate, operation.targetPath, value);
  if (operation.operation === "move" && operation.sourcePaths[0] !== operation.targetPath) {
    const sourcePath = operation.sourcePaths[0];
    const current = migrationRead(state.candidate, sourcePath);
    if (migrationTargetPaths(state.candidate).includes(sourcePath) && current !== undefined) {
      migrationWrite(state.candidate, sourcePath, Array.isArray(current) ? [] : null);
    }
  }
}

export function mergeCharacterMigrationChangeSet(input: {
  context: CharacterMigrationContext;
  previous: CharacterMigrationMerge;
  changeSet: CharacterSemanticMigrationChangeSetV1;
  providerRequestId: string;
  repairClosure: string[] | null;
}): CharacterMigrationMerge {
  const { context, previous, changeSet } = input;
  const state: CharacterMigrationMerge = {
    ...structuredClone(previous), findings: [],
    uncertainties: [...new Set([...previous.uncertainties, ...changeSet.uncertainties])],
  };
  const written: string[] = [];
  for (const [index, operation] of changeSet.operations.entries()) {
    const error = checkOperationPaths({ context, candidate: state.candidate,
      operation, closure: input.repairClosure });
    if (error) {
      state.findings.push(migrationFinding("operation_path_invalid", operation.targetPath, error));
      continue;
    }
    const touched = [operation.targetPath, ...(operation.operation === "move" ?
      operation.sourcePaths.filter((path) => migrationTargetPaths(state.candidate).includes(path)) : [])];
    if (touched.some((target) => written.some((path) =>
      pathContains(path, target) || pathContains(target, path)))) {
      state.findings.push(migrationFinding("overlapping_operations", operation.targetPath,
        context.attempt.promptIdentity === CHARACTER_MIGRATION_PROMPT_V3
          ? `Operation ${index} (${operation.operation}) at ${operation.targetPath} conflicts with an earlier write. Submit one replacement; displaced source is preserved automatically, so do not retire then replace. The earlier write remains applied.`
          : "Use one replacement per path in this response; combine dependent changes explicitly."));
      if (context.attempt.promptIdentity === CHARACTER_MIGRATION_PROMPT_V3) {
        state.findings.push(...rejectedCharacterMigrationFragmentFindings({
          context, candidate: state.candidate, operation,
        }));
      }
      continue;
    }
    const applied = { ...operation, operationId: `operation-${assetContentDigest({
      request: input.providerRequestId, index,
    }).slice(0, 32)}` };
    try {
      applyOperation(state, applied, context);
      state.operations.push(applied);
      written.push(...touched);
    } catch {
      state.findings.push(migrationFinding("operation_parent_missing", operation.targetPath,
        "The registered target parent is unavailable; repair its containing fragment."));
    }
  }
  migrationWrite(state.candidate, "deferredValues.values", state.deferred.map((entry) => ({
    ...entry, requiringCapability: { ...entry.requiringCapability },
  })));
  return state;
}

export function migrationPreservationEntries(
  context: CharacterMigrationContext, state: CharacterMigrationMerge,
): MigrationPreservationCapsuleV1["entries"] {
  const entries: MigrationPreservationCapsuleV1["entries"] = [];
  for (const sourcePath of context.sourcePaths) {
    if (!sourcePath.startsWith("definition.") || sourcePath === "definition.schemaVersion") continue;
    const original = migrationRead(context.sources, sourcePath);
    const current = migrationRead(state.candidate, sourcePath);
    const displaced = current === undefined ||
      assetContentDigest(original) !== assetContentDigest(current);
    if (!displaced || entries.some((entry) => pathContains(entry.sourcePath, sourcePath))) continue;
    const operation = state.operations.find((entry) =>
      entry.sourcePaths.some((path) => pathContains(path, sourcePath) ||
        pathContains(sourcePath, path)) || pathContains(entry.targetPath, sourcePath));
    if (!operation || original === undefined) continue;
    const provenanceCategory = operation.operation === "retire_to_capsule" ? "retired" :
      operation.operation === "move" ? "moved" : "transformed";
    entries.push({ sourcePath, value: original, operationId: operation.operationId, provenanceCategory });
  }
  return [...entries, ...systemMetadataChanges(context, state).map((entry) => ({
    sourcePath: entry.targetPath, value: entry.before, operationId: entry.operationId,
    provenanceCategory: "copied_then_changed" as const,
  }))];
}

export function migrationCapsuleFinding(
  entries: MigrationPreservationCapsuleV1["entries"],
): CharacterMigrationFinding[] {
  // Reserve envelope/identity overhead; the repository independently enforces exact final bytes.
  if (entries.length > 512 ||
      Buffer.byteLength(canonicalAssetJson(entries), "utf8") > CHARACTER_MIGRATION_CAPSULE_MAX_BYTES - 4096) {
    return [migrationFinding("preservation_limit_exceeded", "definition.actionNorms",
      "Exact displaced source values exceed the bounded capsule; nothing may be silently truncated.")];
  }
  return [];
}

const DIFF_CATEGORIES = {
  copy: "unchanged", move: "moved", transform: "transformed",
  synthesize: "synthesized", retire_to_capsule: "retired", defer: "deferred",
} satisfies Record<CharacterSemanticMigrationOperationV1["operation"], CharacterMigrationOwnerDiff["category"]>;

function systemMetadataChanges(
  context: CharacterMigrationContext, state: CharacterMigrationMerge,
): CharacterMigrationOwnerDiff[] {
  return ["definitionSchema", "definition.schemaVersion", "disclosurePolicy",
    "provenance", "compilerCompatibility"].flatMap((path) => {
    const before = migrationRead(context.sources, path) ?? null;
    const after = migrationRead(state.candidate, path) ?? null;
    if (assetContentDigest(before) === assetContentDigest(after)) return [];
    return [{
      operationId: `server-${assetContentDigest({
        attempt: context.attempt.migrationAttemptId, path,
      }).slice(0, 32)}`,
      category: "transformed", targetPath: path, sourcePaths: [path], before, after,
      explanation: "サーバーがV3の版・出典・能力契約を設定し、旧規範の開示ルールを移設または縮小。",
      provenance: "source_derived", behavioralEffect: "表示した変更前後と検証結果を確認してください。",
      disclosureEffect: path === "disclosurePolicy" ?
        "旧規範の開示ルールは、新しい欄に同等の根拠を示せた場合だけ継承。それ以外は縮小。" :
        "開示権限の追加なし。",
    } satisfies CharacterMigrationOwnerDiff];
  });
}

function behavioralEffect(path: string): string {
  if (pathContains("definition.consciousGuidance", path)) {
    return "顕在意識が参照する方針。これ自体はエンジンの行動候補を変更しない。";
  }
  if (pathContains("definition.actionNorms", path)) return "機械的な実行規範と対象セレクタ。";
  if (pathContains("definition.mechanicalConflictFallbacks", path)) {
    return "規範競合時の機械的な代替行動候補とその順序。";
  }
  return "キャラ定義の変更案。モデルの説明は検証済み事実ではなく、所有者確認が必要。";
}

export function characterMigrationOwnerDiff(
  context: CharacterMigrationContext, state: CharacterMigrationMerge,
): CharacterMigrationOwnerDiff[] {
  const operations = state.operations.map((operation): CharacterMigrationOwnerDiff => ({
    operationId: operation.operationId, category: DIFF_CATEGORIES[operation.operation],
    targetPath: operation.targetPath, sourcePaths: operation.sourcePaths,
    before: migrationRead(context.sources, operation.targetPath) ?? null,
    after: migrationRead(state.candidate, operation.targetPath) ?? null,
    explanation: operation.explanation, provenance: operation.provenance,
    behavioralEffect: operation.operation === "copy" ? "変更なし" : behavioralEffect(operation.targetPath),
    disclosureEffect: "元の開示上限を維持し、意味の移動先を検証。consumerTagsは権限を付与しない。",
  }));
  const unchanged = Object.keys(context.source.definition).filter((key) =>
    key !== "schemaVersion" && assetContentDigest(migrationRead(context.sources, `definition.${key}`)) ===
      assetContentDigest(migrationRead(state.candidate, `definition.${key}`)));
  return [...operations, ...systemMetadataChanges(context, state), ...unchanged.filter((key) =>
    !operations.some((entry) => pathContains(`definition.${key}`, entry.targetPath)))
    .map((key): CharacterMigrationOwnerDiff => ({
      operationId: `unchanged-${key}`, category: "unchanged",
      targetPath: `definition.${key}`, sourcePaths: [`definition.${key}`],
      before: migrationRead(context.sources, `definition.${key}`) ?? null,
      after: migrationRead(state.candidate, `definition.${key}`) ?? null,
      explanation: "役割が変わらない値をサーバーがそのまま継承。",
      provenance: "unchanged", behavioralEffect: "変更なし", disclosureEffect: "変更なし",
    }))];
}
