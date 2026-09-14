import {
  type CharacterGenerationEnvelopeV3, type CharacterMigrationFinding,
} from "@kshiai/shared";
import {
  migrationPaths, migrationRead, pathContains, type CharacterMigrationContext,
} from "./character-migration-context.js";
import { migrationFinding, type CharacterMigrationMerge } from "./character-migration-merge.js";

export function characterMigrationReferenceFindings(input: {
  context: CharacterMigrationContext;
  state: CharacterMigrationMerge;
  candidate: CharacterGenerationEnvelopeV3;
}): CharacterMigrationFinding[] {
  const { context, state, candidate } = input;
  const findings: CharacterMigrationFinding[] = [];
  const nameRef = candidate.definition.speechPolicy.selfReferenceNameId;
  if (nameRef !== null && !candidate.definition.identity.names.some((name) => name.id === nameRef)) {
    findings.push(migrationFinding("unknown_name_reference", "definition.speechPolicy.selfReferenceNameId",
      "Self-reference must resolve to a name in this candidate."));
  }
  const originalSupportRefs = context.sourcePaths.filter((path) => path.endsWith(".sourceSupportRefs"))
    .flatMap((path) => {
      const value = migrationRead(context.sources, path);
      return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
    });
  const allowed = new Set([...context.sourcePaths, ...originalSupportRefs]);
  for (const path of migrationPaths(state.candidate).filter((entry) => entry.endsWith(".sourceSupportRefs"))) {
    const refs = migrationRead(state.candidate, path);
    if (Array.isArray(refs) && refs.some((ref) => typeof ref !== "string" || !allowed.has(ref))) {
      findings.push(migrationFinding("unregistered_support_reference", path,
        "Support references must identify frozen source paths or retained source support IDs."));
    }
  }
  for (const collection of Object.keys(context.allocatedIds)) {
    const ids = migrationPaths(state.candidate).filter((path) =>
      pathContains(collection, path) && path.endsWith(".id")).map((path) =>
      migrationRead(state.candidate, path));
    if (ids.length !== new Set(ids).size) {
      findings.push(migrationFinding("duplicate_stable_id", collection,
        "Stable IDs must remain unique inside their registered collection."));
    }
  }
  return findings;
}
