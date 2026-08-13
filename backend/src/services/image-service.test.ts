import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CharacterSheetSchema,
  defaultParameters,
  type BattlefieldPreset,
  type CharacterImageBriefV2,
} from "@kshiai/shared";
import type { ImageProvider } from "../image/index.js";
import {
  buildBattlefieldImagePrompt,
  buildCharacterPortraitPrompt,
  generateAndStoreCharacterPortrait,
  publicRevisionedMediaPath,
} from "./image-service.js";

describe("battlefield image prompts", () => {
  it("synthesizes the visual field state without combat coefficients", () => {
    const preset = {
      id: "bf-1",
      ownerUserId: "user-1",
      isSystem: false,
      displayName: "雨の廃都",
      category: "urban",
      tags: [],
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
      appearance: {
        summary: "雨に沈む石造りの街路",
        visualPrompt: "wet ruined city at night",
      },
      terrainHints: ["石畳", "狭い路地"],
      obstacleHints: ["倒れた街灯"],
      conditionHints: ["豪雨", "夜"],
      baseCoefficients: { speed: 0.7 },
      narrativeBlurb: "水音が足音を隠す廃都。",
    } satisfies BattlefieldPreset;

    const prompt = buildBattlefieldImagePrompt(preset, "青い月明かり");

    assert.match(prompt, /wet ruined city at night/);
    assert.match(prompt, /石畳/);
    assert.match(prompt, /倒れた街灯/);
    assert.match(prompt, /豪雨/);
    assert.match(prompt, /青い月明かり/);
    assert.doesNotMatch(prompt, /0\.7|speed/);
  });
});

describe("character image failure", () => {
  it("uses only the V2 appearance brief and explicit visual adjustment", () => {
    const sheet = CharacterSheetSchema.parse({
      id: "char-image-brief",
      ownerUserId: "user-1",
      displayName: "秘密名",
      tags: ["secret-history"],
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
      appearance: { summary: "legacy summary", visualPrompt: "legacy visual" },
      traits: ["王都を救った過去"],
      parameters: defaultParameters(),
      skills: [],
      weapon: { name: "秘密の剣", description: "history", atkBonus: 1, defBonus: 0, magBonus: 0 },
      armor: null,
      combatFlags: { canFight: true, irreversibleIncapacitated: false },
      narrativeBlurb: "秘密の関係を持つ。",
    });
    const brief: CharacterImageBriefV2 = {
      contractVersion: 2,
      publicSummary: "赤い外套をまとう成人",
      details: ["琥珀色の瞳"],
      visualPrompt: "adult traveler, red cloak, amber eyes",
    };
    const prompt = buildCharacterPortraitPrompt(sheet, "rainy lighting", brief);
    assert.match(prompt, /red cloak/);
    assert.match(prompt, /琥珀色の瞳/);
    assert.match(prompt, /rainy lighting/);
    assert.doesNotMatch(prompt, /秘密名|王都|秘密の剣|秘密の関係|legacy/);
  });

  it("builds an immutable local URL for a V2 media revision", () => {
    assert.equal(
      publicRevisionedMediaPath("characters", "char-1", "img-abc123"),
      "/api/media/characters/char-1.img-abc123.jpg",
    );
    assert.throws(
      () => publicRevisionedMediaPath("characters", "char-1", "../escape"),
      /invalid_media_revision_id/,
    );
  });

  it("rejects instead of returning a persisted placeholder URL", async () => {
    const sheet = CharacterSheetSchema.parse({
      id: "char-image-failure",
      ownerUserId: "user-1",
      displayName: "テスト成人",
      tags: [],
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
      appearance: { summary: "黒髪の剣士", visualPrompt: "adult swordsman" },
      traits: ["冷静"],
      parameters: defaultParameters(),
      skills: [],
      weapon: null,
      armor: null,
      combatFlags: { canFight: true, irreversibleIncapacitated: false },
      narrativeBlurb: "静かな剣士。",
    });
    const failingProvider: ImageProvider = {
      name: "failing",
      async generate() {
        throw new Error("provider_down");
      },
    };

    await assert.rejects(
      generateAndStoreCharacterPortrait(sheet, undefined, failingProvider),
      /provider_down/,
    );
  });
});
