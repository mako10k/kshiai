import {
  type CharacterCompilerCapabilityV1, type CharacterDeferredValueV1,
  type CharacterMigrationFinding,
} from "@kshiai/shared";
import { pathContains } from "./character-migration-context.js";
import { migrationFinding } from "./character-migration-merge.js";

// Server-owned field/consumer dependencies. A model cannot evade a required
// consumer by assigning a missing field to an unrelated optional capability.
const DEPENDENCIES: Array<{ roots: string[]; consumers: CharacterCompilerCapabilityV1[] }> = [
  { roots: ["definition.actionNorms"], consumers: [
    { consumer: "character-action-norms", version: 3 }, { consumer: "battle-mechanics", version: 3 },
  ] },
  { roots: ["definition.consciousGuidance"], consumers: [
    { consumer: "character-conscious-self", version: 3 },
  ] },
  { roots: ["definition.mechanicalConflictFallbacks"], consumers: [
    { consumer: "character-mechanical-conflict-fallback", version: 1 },
    { consumer: "battle-mechanics", version: 3 },
  ] },
  { roots: ["definition.expressionNotes", "definition.appearance"], consumers: [
    { consumer: "character-profile", version: 2 }, { consumer: "character-image-brief", version: 2 },
    { consumer: "character-conscious-self", version: 3 }, { consumer: "character-narrator-view", version: 2 },
  ] },
  { roots: ["definition.identity", "definition.profileBackground", "definition.speechPolicy"], consumers: [
    { consumer: "character-profile", version: 2 }, { consumer: "character-conscious-self", version: 3 },
    { consumer: "character-narrator-view", version: 2 },
  ] },
  { roots: ["definition.psycheDisposition"], consumers: [
    { consumer: "psyche-trait-profile", version: 1 }, { consumer: "character-conscious-self", version: 3 },
    { consumer: "character-narrator-view", version: 2 }, { consumer: "character-profile", version: 2 },
  ] },
  { roots: ["definition.relationshipSeeds"], consumers: [
    { consumer: "character-relationship", version: 2 }, { consumer: "character-conscious-self", version: 3 },
  ] },
];

export function validateCharacterMigrationDeferred(values: CharacterDeferredValueV1[]) {
  const expanded: CharacterDeferredValueV1[] = [];
  const findings: CharacterMigrationFinding[] = [];
  for (const value of values) {
    const affected = DEPENDENCIES.filter((entry) =>
      entry.roots.some((root) => pathContains(root, value.targetPath))).flatMap((entry) => entry.consumers);
    if (!affected.some((consumer) =>
      consumer.consumer === value.requiringCapability.consumer &&
      consumer.version === value.requiringCapability.version)) {
      findings.push(migrationFinding("deferred_capability_mismatch", value.targetPath,
        "The declared requiring capability is not a registered consumer of this field."));
    }
    expanded.push(...affected.map((requiringCapability) => ({ ...value, requiringCapability })));
  }
  return { expanded, findings };
}
