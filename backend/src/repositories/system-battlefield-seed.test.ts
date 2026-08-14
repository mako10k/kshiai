import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";
import {
  BattlefieldGenerationEnvelopeV2Schema,
  SYSTEM_PRESET_SEEDS,
  type BattlefieldPreset,
} from "@kshiai/shared";

const directory = mkdtempSync(join(tmpdir(), "kshiai-system-field-seed-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(directory, "seed.db");

const { closeDatabase } = await import("../db.js");
const battlefieldRepo = await import("./battlefields.js");
const battlefieldAssetRepo = await import("./battlefield-assets-v2.js");
const { buildImportedBattlefieldEnvelopeV2 } = await import(
  "../services/battlefield-authoring-service.js"
);

after(async () => {
  await closeDatabase();
  rmSync(directory, { recursive: true, force: true });
});

describe("system battlefield seed activation", () => {
  it("activates a refreshed read model as a new ready generation", async () => {
    const seed = SYSTEM_PRESET_SEEDS.find((value) => value.category === "forest");
    assert.ok(seed?.appearance.imageUrl);
    const now = "2026-08-14T00:00:00.000Z";
    const legacyPreset: BattlefieldPreset = {
      ...seed,
      id: "system-field-refresh-fixture",
      ownerUserId: null,
      isSystem: true,
      appearance: {
        ...seed.appearance,
        imageUrl: "/battlefields/legacy-forest.jpg",
      },
      createdAt: now,
      updatedAt: now,
    };
    const initial = await battlefieldAssetRepo.activateImportedBattlefield({
      preset: legacyPreset,
      envelope: buildImportedBattlefieldEnvelopeV2({
        preset: legacyPreset,
        attemptId: "system-field-refresh-initial-v2",
      }),
    });

    await battlefieldRepo.ensureSystemPresets();
    const refreshedPreset = await battlefieldRepo.getPreset(legacyPreset.id);
    const refreshedGeneration = await battlefieldAssetRepo
      .getReadyBattlefieldGeneration(legacyPreset.id);
    assert.ok(refreshedPreset);
    assert.ok(refreshedGeneration);
    assert.equal(refreshedPreset.appearance.imageUrl, seed.appearance.imageUrl);
    assert.notEqual(refreshedGeneration.generationId, initial.generationId);
    const refreshedEnvelope = BattlefieldGenerationEnvelopeV2Schema.parse(
      refreshedGeneration.content,
    );
    assert.equal(
      refreshedEnvelope.definition.appearance.image?.mediaId,
      seed.appearance.imageUrl,
    );

    await battlefieldRepo.ensureSystemPresets();
    assert.equal(
      (await battlefieldAssetRepo.getReadyBattlefieldGeneration(legacyPreset.id))
        ?.generationId,
      refreshedGeneration.generationId,
    );
  });
});
