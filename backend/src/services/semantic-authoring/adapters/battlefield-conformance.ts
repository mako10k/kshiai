import {
  BattlefieldDefinitionV2Schema,
  BattlefieldPresetSchema,
  legacyBattlefieldPresetToDefinitionV2,
  type BattlefieldPreset,
} from "@kshiai/shared";
import { createFamilyConformanceAdapter } from "./family-conformance.js";

const now = "2026-09-12T00:00:00.000Z";
const scaffold: BattlefieldPreset = BattlefieldPresetSchema.parse({
  id: "battlefield-scaffold",
  ownerUserId: "owner",
  isSystem: false,
  displayName: "未設定",
  category: "custom",
  tags: [],
  createdAt: now,
  updatedAt: now,
  appearance: { summary: "未設定", visualPrompt: "unspecified" },
  terrainHints: [],
  obstacleHints: [],
  conditionHints: [],
  baseCoefficients: {},
  narrativeBlurb: "未設定",
});

export function createBattlefieldConformanceAdapter() {
  return createFamilyConformanceAdapter({
    identity: "battlefield-semantic-authoring-conformance-v1",
    scaffold,
    parse: (value) => {
      const parsed = BattlefieldPresetSchema.safeParse(value);
      return parsed.success ? parsed.data : null;
    },
    displayName: (candidate) => candidate.displayName,
    withDisplayName: (candidate, value) => ({ ...candidate, displayName: value }),
    compile: (candidate) => {
      const definition = BattlefieldDefinitionV2Schema.safeParse(
        legacyBattlefieldPresetToDefinitionV2(candidate),
      );
      return definition.success
        ? {
            compilerIdentity: "battlefield-definition-v2",
            disclosureIdentity: "battlefield-disclosure-v2",
          }
        : null;
    },
  });
}
