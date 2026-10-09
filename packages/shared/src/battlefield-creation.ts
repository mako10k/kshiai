// R: Prepare a typed battlefield instance and its stable initial world placement for battle creation.
import { SemanticIdSchema, type BattleSemanticState } from "./semantic-state.js";
import type { BattlefieldInstance } from "./battlefield.js";
import {
  BATTLEFIELD_INSTANCE_COMPILER_V2,
  BattlefieldDefinitionV2Schema,
  compileBattlefieldInstanceV2,
  type BattlefieldDefinitionV2,
} from "./structured-battlefield.js";
import {
  type BattleWorldArea,
  type BattleWorldInitialLayout,
} from "./battle-world.js";

export type BattlefieldCreation =
  | { kind: "legacy"; instance: BattlefieldInstance }
  | { kind: "structured"; instance: BattlefieldInstance; worldLayout: BattleWorldInitialLayout };

function area(label: string): BattleWorldArea {
  return { label, illumination: "normal", noise: "normal", space: "open", movement: "open" };
}

export function prepareStructuredBattlefieldCreationV2(
  definition: BattlefieldDefinitionV2,
  sourcePresetId: string,
): Extract<BattlefieldCreation, { kind: "structured" }> {
  const parsed = BattlefieldDefinitionV2Schema.parse(definition);
  const sceneAreaIds: Record<string, string> = {
    "character.a": parsed.entryAreas.a,
    "character.b": parsed.entryAreas.b,
  };
  for (const entry of parsed.areas) sceneAreaIds[entry.id] = entry.id;
  for (const object of parsed.objects) {
    if (object.presence === "present") sceneAreaIds[object.id] = object.areaId;
  }
  for (const effect of parsed.effects) {
    sceneAreaIds[effect.id] = effect.target.kind === "area" || effect.target.kind === "area_occupants"
      ? effect.target.areaId
      : parsed.entryAreas.a;
  }
  return {
    kind: "structured",
    instance: compileBattlefieldInstanceV2(parsed, sourcePresetId),
    worldLayout: {
      areas: Object.fromEntries(parsed.areas.map((entry) => [entry.id, area(entry.name)])),
      sceneAreaIds,
    },
  };
}

export function assertLegacyBattlefieldCreation(instance: BattlefieldInstance): void {
  if (instance.compilerContract === BATTLEFIELD_INSTANCE_COMPILER_V2) {
    throw new Error("STRUCTURED_BATTLEFIELD_INITIAL_LAYOUT_REQUIRED");
  }
}

export function prepareLegacyBattlefieldWorldLayout(
  instance: BattlefieldInstance,
  semanticState: BattleSemanticState,
): BattleWorldInitialLayout | undefined {
  assertLegacyBattlefieldCreation(instance);
  if (!instance.areas?.length) return undefined;
  const { areas, idsByLabel } = prepareLegacyAreaLookup(instance.areas);
  const sceneAreaIds: Record<string, string> = {};
  let nextGeneratedId = 1;
  for (const [entityId, entity] of Object.entries(semanticState.entities)) {
    if (entity.location.type !== "scene") continue;
    const entryAreaId = entityId === "character.a" ? instance.entryAreas?.a
      : entityId === "character.b" ? instance.entryAreas?.b : undefined;
    if (entryAreaId) {
      if (!Object.hasOwn(areas, entryAreaId)) throw new Error("BATTLEFIELD_INITIAL_ENTRY_AREA_INVALID");
      sceneAreaIds[entityId] = entryAreaId;
      continue;
    }
    const matches = idsByLabel.get(entity.location.area) ?? [];
    if (matches.length > 1) throw new Error("BATTLEFIELD_LEGACY_AREA_LABEL_AMBIGUOUS");
    let areaId = matches[0];
    if (!areaId) {
      do { areaId = `area.legacy.${nextGeneratedId++}`; } while (Object.hasOwn(areas, areaId));
      areas[areaId] = area(entity.location.area);
      idsByLabel.set(entity.location.area, [areaId]);
    }
    sceneAreaIds[entityId] = areaId;
  }
  return { areas, sceneAreaIds };
}

function prepareLegacyAreaLookup(entries: NonNullable<BattlefieldInstance["areas"]>) {
  const areas: Record<string, BattleWorldArea> = {};
  const idsByLabel = new Map<string, string[]>();
  for (const entry of entries) {
    SemanticIdSchema.parse(entry.id);
    if (Object.hasOwn(areas, entry.id)) throw new Error("BATTLEFIELD_INITIAL_AREA_ID_DUPLICATE");
    areas[entry.id] = area(entry.name);
    idsByLabel.set(entry.name, [...(idsByLabel.get(entry.name) ?? []), entry.id]);
  }
  return { areas, idsByLabel };
}
