/** R: Verify historical character resolution remains bound to immutable battle snapshots. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { defaultBasicAttack, defaultParameters, requireCombatReadyCharacterSheet, type CombatReadyCharacterSheet } from "@kshiai/shared";
import { resolveHistoricalCharacterView, type HistoricalCharacterBattle } from "./character-historical-view.js";
const createdAt = "2026-09-14T00:00:00.000Z";
function sheet(): CombatReadyCharacterSheet {
  return requireCombatReadyCharacterSheet({
    id: "reader-character",
    ownerUserId: "reader-owner",
    displayName: "版別読取",
    tags: ["reader"],
    createdAt,
    updatedAt: createdAt,
    appearance: {
      summary: "青い外套",
      visualPrompt: "adult in a blue cloak",
      imageUrl: null,
      previousImageUrl: "https://example.test/previous.png",
    },
    traits: ["慎重"],
    parameters: defaultParameters(),
    basicAttack: defaultBasicAttack(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "版別 reader の一時フィクスチャ。",
    visibility: "private",
  });
}

function battle(): HistoricalCharacterBattle {
  const old = sheet();
  return { sideA: { characterId: old.id }, sideB: { characterId: "other" },
    assetManifest: { characters: {
      a: { assetId: old.id, generationId: "character:old-v2", snapshot: old },
      b: { assetId: "other", generationId: "character:other-v2", snapshot: { ...old, id: "other" } },
    } } };
}
describe("historical character view", () => {
  it("returns the old V2 snapshot despite a later current migration", () => {
    const bound = battle();
    const currentV3 = { ...sheet(), displayName: "new V3 name" };
    const result = resolveHistoricalCharacterView(bound, currentV3.id);
    assert.equal(result?.generationId, "character:old-v2");
    assert.equal(result?.sheet.displayName, "版別読取");
    assert.equal(result?.sheet, bound.assetManifest?.characters.a.snapshot);
  });
  it("rejects missing manifests and unrelated characters", () => {
    assert.equal(resolveHistoricalCharacterView({ sideA: battle().sideA, sideB: battle().sideB }, sheet().id), null);
    assert.equal(resolveHistoricalCharacterView(battle(), "unrelated"), null);
  });
  it("rejects mismatched binding and snapshot identities", () => {
    const bound = battle();
    assert.ok(bound.assetManifest);
    bound.assetManifest.characters.a.assetId = "wrong";
    assert.equal(resolveHistoricalCharacterView(bound, sheet().id), null);
    bound.assetManifest.characters.a.assetId = sheet().id;
    bound.assetManifest.characters.a.snapshot = { ...sheet(), id: "wrong" };
    assert.equal(resolveHistoricalCharacterView(bound, sheet().id), null);
  });
});
