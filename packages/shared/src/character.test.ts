import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CharacterSheetSchema,
  captureRevisionSnapshot,
  coalesceNonEmptyList,
  defaultParameters,
  ensureCharacterCombatProperties,
  ensureCharacterIdentityProperties,
  restoreRevisionSnapshot,
  toggleCharacterPortrait,
  toPublicCharacter,
  toBattleCharacterSnapshot,
} from "./character.js";

describe("coalesceNonEmptyList", () => {
  it("keeps current when patch is empty, null, or undefined", () => {
    const current = [{ id: "a" }, { id: "b" }];
    assert.deepEqual(coalesceNonEmptyList([], current), current);
    assert.deepEqual(coalesceNonEmptyList(null, current), current);
    assert.deepEqual(coalesceNonEmptyList(undefined, current), current);
  });

  it("uses a non-empty patch", () => {
    const current = [{ id: "a" }];
    const patch = [{ id: "x" }, { id: "y" }];
    assert.deepEqual(coalesceNonEmptyList(patch, current), patch);
  });
});

describe("portrait toggle", () => {
  it("swaps current and previous image urls", () => {
    const sheet = CharacterSheetSchema.parse({
      id: "chr_1",
      ownerUserId: "u1",
      displayName: "みき",
      tags: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      appearance: {
        summary: "和装",
        visualPrompt: "anime portrait",
        imageUrl: "/api/media/characters/chr_1.jpg",
        previousImageUrl: "/api/media/characters/chr_1.prev.jpg",
      },
      traits: [],
      parameters: defaultParameters(),
      skills: [],
      weapon: null,
      armor: null,
      combatFlags: { canFight: true, irreversibleIncapacitated: false },
      narrativeBlurb: "test",
    });
    const toggled = toggleCharacterPortrait(sheet);
    assert.ok(toggled);
    assert.equal(
      toggled!.appearance.imageUrl,
      "/api/media/characters/chr_1.prev.jpg",
    );
    assert.equal(
      toggled!.appearance.previousImageUrl,
      "/api/media/characters/chr_1.jpg",
    );
    const pub = toPublicCharacter(sheet, "u1");
    assert.equal(pub.canToggleImage, true);
    assert.ok(pub.appearance.previousImageUrl);
    assert.equal(toPublicCharacter(sheet, "other").canToggleImage, undefined);
  });
});

describe("revision snapshot restore", () => {
  it("restores mutable fields and clears the undo buffer", () => {
    const base = CharacterSheetSchema.parse({
      id: "chr_1",
      ownerUserId: "u1",
      displayName: "みき",
      tags: ["unlucky"],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      appearance: { summary: "和装", visualPrompt: "anime portrait" },
      traits: ["不運"],
      parameters: defaultParameters(),
      skills: [
        {
          id: "sk1",
          name: "つまずき突き",
          description: "転ぶ勢いの一撃",
          costMp: 0,
          costStamina: 8,
          power: 1.2,
          kind: "attack",
        },
      ],
      weapon: null,
      armor: null,
      combatFlags: { canFight: true, irreversibleIncapacitated: false },
      narrativeBlurb: "不運な女の子。",
    });
    const snap = captureRevisionSnapshot(base, "会話調整前");
    const damaged = {
      ...base,
      displayName: "Miki",
      traits: ["unlucky"],
      skills: [],
      narrativeBlurb: "An unlucky girl.",
      revisionSnapshot: snap,
      updatedAt: "2026-02-01T00:00:00.000Z",
    };
    const restored = restoreRevisionSnapshot(damaged, snap);
    assert.equal(restored.displayName, "みき");
    assert.equal(restored.skills.length, 1);
    assert.equal(restored.skills[0]?.name, "つまずき突き");
    assert.equal(restored.narrativeBlurb, "不運な女の子。");
    assert.equal(restored.revisionSnapshot, null);
    const pub = toPublicCharacter(damaged, "u1");
    assert.equal(pub.canRestoreRevision, true);
    assert.equal(toPublicCharacter(restored, "u1").canRestoreRevision, false);
  });
});

describe("character combat extensions", () => {
  it("excludes mutable owner and record state from battle snapshots", () => {
    const sheet = CharacterSheetSchema.parse({
      id: "battle-snapshot",
      ownerUserId: "u1",
      displayName: "固定対象",
      visibility: "private",
      tags: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      deletedAt: null,
      appearance: { summary: "test", visualPrompt: "test" },
      traits: [],
      parameters: defaultParameters(),
      skills: [],
      weapon: null,
      armor: null,
      combatFlags: { canFight: true, irreversibleIncapacitated: false },
      narrativeBlurb: "test",
      record: { rating: 1500, gamesPlayed: 1, wins: 1, losses: 0, draws: 0 },
      opponentMemories: {
        opponent: {
          preBattlePlan: "private",
          postBattleReflection: "private",
          battleCount: 1,
          lastBattleAt: "2026-01-01T00:00:00.000Z",
        },
      },
      revisionSnapshot: null,
    });
    const snapshot = toBattleCharacterSnapshot(sheet);
    assert.equal(snapshot.visibility, undefined);
    assert.equal(snapshot.record, undefined);
    assert.equal(snapshot.opponentMemories, undefined);
    assert.equal(snapshot.revisionSnapshot, undefined);
    assert.equal(snapshot.displayName, sheet.displayName);
    assert.deepEqual(snapshot.parameters, sheet.parameters);
  });

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
    assert.equal(hydrated.basicAttack?.name, "基本アクション");
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
    assert.equal(publicSheet.basicAttackName, "基本アクション");
    assert.deepEqual(publicSheet.names, {
      realName: null,
      nicknames: [],
      selfNames: [],
      epithets: [],
    });
    assert.equal(publicSheet.skillSummaries[0]?.name, "旧技");
  });
});
