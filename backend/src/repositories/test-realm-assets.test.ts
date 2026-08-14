import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BattlefieldPreset, NarrationStyle } from "@kshiai/shared";

const tempDir = mkdtempSync(join(tmpdir(), "kshiai-test-realm-assets-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(tempDir, "test.db");
process.env.ADMIN_EMAILS = "mako10k@mk10.org";
const battlefieldRepo = await import("./battlefields.js");
const narrationStyleRepo = await import("./narration-styles.js");
const narrationStyleAssetRepo = await import("./narration-style-assets-v2.js");
const { buildImportedNarrationStyleEnvelopeV2 } = await import(
  "../services/narration-style-authoring-service.js"
);
const { getDb } = await import("../db.js");

after(() => rmSync(tempDir, { recursive: true, force: true }));

const now = "2026-08-07T00:00:00.000Z";

function battlefield(id: string, ownerUserId: string): BattlefieldPreset {
  return {
    id,
    ownerUserId,
    isSystem: false,
    displayName: id,
    category: "urban",
    tags: ["e2e"],
    createdAt: now,
    updatedAt: now,
    appearance: { summary: id, visualPrompt: id },
    terrainHints: ["濡れた路地"],
    obstacleHints: ["赤いワゴン"],
    conditionHints: ["霧雨"],
    baseCoefficients: {},
    narrativeBlurb: "E2E観測用の固定戦場",
  };
}

function narrationStyle(id: string, ownerUserId: string): NarrationStyle {
  return {
    id,
    ownerUserId,
    isSystem: false,
    displayName: id,
    description: "E2E観測用",
    instruction: "動作、因果、次の戦闘への具体的影響を順に描写する。",
    perspective: "external",
    tags: ["e2e"],
    createdAt: now,
    updatedAt: now,
  };
}

describe("test-realm shared assets", () => {
  it("shares test assets across test accounts without exposing them to general users", async () => {
    const db = getDb();
    const insertUser = db.prepare(
      `INSERT INTO users
        (id, username, password_hash, email, account_kind, created_at)
       VALUES (?, ?, 'x', ?, ?, ?)`,
    );
    insertUser.run("general", "general", "general@example.test", "general", now);
    insertUser.run("e2e-a", "e2e-a", "e2e-a@example.test", "e2e", now);
    insertUser.run("test-b", "test-b", "test-b@example.test", "test", now);
    insertUser.run("admin", "admin", "mako10k@mk10.org", "general", now);

    await battlefieldRepo.importPreset(battlefield("field-e2e", "e2e-a"));
    const readyStyle = narrationStyle("style-e2e", "e2e-a");
    await narrationStyleAssetRepo.activateImportedNarrationStyle({
      style: readyStyle,
      envelope: buildImportedNarrationStyleEnvelopeV2({
        style: readyStyle,
        attemptId: "test-realm-style-import-v2",
      }),
    });

    assert.equal(
      (await battlefieldRepo.listPresets({ userId: "general" }))
        .some((item) => item.id === "field-e2e"),
      false,
    );
    assert.equal(
      (await narrationStyleRepo.listNarrationStyles("general"))
        .some((item) => item.id === "style-e2e"),
      false,
    );
    assert.equal(
      await battlefieldRepo.getPresetForUser("field-e2e", "general"),
      null,
    );
    await assert.rejects(
      narrationStyleRepo.resolveReadyNarrationStyleForUser("general", "style-e2e"),
      /NARRATION_STYLE_NOT_FOUND/,
    );
    assert.equal(
      (await battlefieldRepo.getPresetForUser("field-e2e", "test-b"))?.id,
      "field-e2e",
    );
    assert.equal(
      (await narrationStyleRepo.resolveReadyNarrationStyleForUser("test-b", "style-e2e"))
        .style.id,
      "style-e2e",
    );
    assert.equal(
      (await battlefieldRepo.getPresetForUser("field-e2e", "admin"))?.id,
      "field-e2e",
    );
    assert.equal(
      (await narrationStyleRepo.resolveReadyNarrationStyleForUser("admin", "style-e2e"))
        .style.id,
      "style-e2e",
    );
  });
});
