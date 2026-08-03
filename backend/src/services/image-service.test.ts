import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CharacterSheetSchema,
  defaultParameters,
  type BattlefieldPreset,
} from "@kshiai/shared";
import type { ImageProvider } from "../image/index.js";
import {
  buildBattlefieldImagePrompt,
  generateAndStoreCharacterPortrait,
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
