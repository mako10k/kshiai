import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyBattlefieldDefinitionGapFillV2,
  listBattlefieldDefinitionGapsV2,
  parseBattlefieldDefinitionGapFillV2,
  restoreAuthoritativeBattlefieldDefinitionV2,
} from "./battlefield-definition-check.js";
import {
  BattlefieldDefinitionV2Schema,
  legacyBattlefieldPresetToDefinitionV2,
} from "./structured-battlefield.js";
import type { BattlefieldPreset } from "./battlefield.js";

function legacyPreset(): BattlefieldPreset {
  return {
    id: "field-legacy",
    ownerUserId: "owner",
    isSystem: false,
    displayName: "霧の遺跡",
    category: "ruins",
    tags: ["霧"],
    createdAt: "2026-08-14T00:00:00.000Z",
    updatedAt: "2026-08-14T00:00:00.000Z",
    appearance: {
      summary: "霧に沈む石造遺跡",
      visualPrompt: "misty stone ruins",
      imageUrl: "/field.jpg",
    },
    terrainHints: ["中央広場", "崩れた回廊"],
    obstacleHints: [],
    conditionHints: [],
    baseCoefficients: { damage: 0.9, fire: 0.7 },
    narrativeBlurb: "霧に閉ざされた遺跡。",
  };
}

describe("battlefield definition upgrade fills", () => {
  it("lists empty enrichment sections on a legacy conversion", () => {
    const definition = legacyBattlefieldPresetToDefinitionV2(legacyPreset());
    assert.deepEqual(listBattlefieldDefinitionGapsV2(definition), [
      "atmosphere",
      "areaDetails",
      "objects",
      "effects",
      "evolutionAffordances",
    ]);
  });

  it("accepts a natural string-description fill and keeps coefficients", () => {
    const base = legacyBattlefieldPresetToDefinitionV2(legacyPreset());
    const fill = parseBattlefieldDefinitionGapFillV2({
      atmosphere: ["濃霧", "静けさ"],
      scale: null,
      genre: null,
      areas: [{
        id: "中央広場",
        name: "中央広場",
        description: "霧のたまる石畳",
        terrain: "solid",
        movement: "normal",
        visibility: "obscured",
        audibility: "muffled",
        surfaceConditions: ["湿った石"],
      }],
      objects: [{
        id: "石柱",
        label: "倒れた石柱",
        description: "広場を横切る石柱",
        area: "中央広場",
        portable: false,
        usable: false,
        cover: "partial",
        blocking: true,
      }],
      effects: [{
        id: "霧",
        label: "濃霧",
        description: "視界を落とす霧",
        trigger: "battle_start",
        duration: "persistent",
        target: "scene",
        area: "",
        observable: true,
      }],
      evolutionAffordances: [{
        id: "霧が濃くなる",
        pressure: "visibility_shift",
        description: "膠着すると霧だけが濃くなる",
      }],
    });
    const filled = applyBattlefieldDefinitionGapFillV2(
      base,
      fill,
      "upgrade_description",
    );
    assert.deepEqual(filled.identity.atmosphere, ["濃霧", "静けさ"]);
    assert.equal(filled.areas[0]?.visibility, "obscured");
    assert.equal(filled.objects[0]?.label, "倒れた石柱");
    assert.match(filled.objects[0]?.id ?? "", /^[A-Za-z]/);
    assert.equal(filled.effects[0]?.duration.kind, "persistent");
    assert.equal(filled.evolutionAffordances[0]?.pressure, "visibility_shift");
    assert.equal(filled.baseCoefficients.damage, 0.9);
    assert.equal(filled.appearance.image?.mediaId, "/field.jpg");
  });

  it("restores appearance and coefficients when an upgrade candidate drifts", () => {
    const base = legacyBattlefieldPresetToDefinitionV2(legacyPreset());
    const drifted = BattlefieldDefinitionV2Schema.parse({
      ...base,
      identity: { ...base.identity, displayName: "別の遺跡" },
      appearance: { ...base.appearance, publicSummary: "別の光景" },
      baseCoefficients: { ...base.baseCoefficients, damage: 2 },
    });
    const restored = restoreAuthoritativeBattlefieldDefinitionV2(
      base,
      drifted,
      "upgrade_description",
    );
    assert.equal(restored.identity.displayName, "霧の遺跡");
    assert.equal(restored.appearance.publicSummary, "霧に沈む石造遺跡");
    assert.equal(restored.baseCoefficients.damage, 0.9);
  });
});
