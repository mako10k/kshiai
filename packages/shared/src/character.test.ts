import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CharacterSheetSchema,
  defaultParameters,
  ensureCharacterCombatProperties,
  ensureCharacterIdentityProperties,
  toPublicCharacter,
} from "./character.js";

describe("character combat extensions", () => {
  it("keeps legacy character JSON compatible and supplies a public default attack", () => {
    const sheet = CharacterSheetSchema.parse({
      id: "legacy",
      ownerUserId: "u1",
      displayName: "旧式",
      tags: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      appearance: { summary: "test", visualPrompt: "test" },
      traits: [],
      parameters: defaultParameters(),
      skills: [
        {
          id: "old-skill",
          name: "旧技",
          description: "従来形式",
          costMp: 0,
          costStamina: 1,
          power: 1,
          kind: "attack",
        },
      ],
      weapon: null,
      armor: null,
      combatFlags: { canFight: true, irreversibleIncapacitated: false },
      narrativeBlurb: "旧形式のキャラクター。",
    });

    assert.equal(sheet.basicAttack, undefined);
    assert.equal(sheet.identity, undefined);
    assert.equal(sheet.skills[0]?.effects, undefined);
    const hydrated = ensureCharacterCombatProperties(sheet);
    assert.equal(hydrated.basicAttack?.name, "通常攻撃");
    assert.deepEqual(hydrated.skills[0]?.effects, []);
    assert.deepEqual(ensureCharacterIdentityProperties(sheet).identity, {
      realName: null,
      nicknames: [],
      selfNames: [],
      epithets: [],
      gender: null,
      age: null,
    });
    const publicSheet = toPublicCharacter(sheet, "u1");
    assert.equal(publicSheet.basicAttackName, "通常攻撃");
    assert.deepEqual(publicSheet.names, {
      realName: null,
      nicknames: [],
      selfNames: [],
      epithets: [],
    });
    assert.equal(publicSheet.skillSummaries[0]?.name, "旧技");
  });
});
