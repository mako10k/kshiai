import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_DIALOGUE_PSYCHOLOGY_GUIDANCE } from "@kshiai/shared";

const tempDir = mkdtempSync(join(tmpdir(), "kshiai-dialogue-pipeline-test-"));
process.env.DATABASE_URL = "";
process.env.AUTH_PROVIDER = "legacy";
process.env.DATABASE_PATH = join(tempDir, "test.db");
const settingsRepo = await import("./dialogue-pipeline-settings.js");
const { getDb } = await import("../db.js");

after(() => rmSync(tempDir, { recursive: true, force: true }));

describe("dialogue pipeline settings", () => {
  it("uses an auditable runtime default until an administrator saves", async () => {
    const settings = await settingsRepo.getDialoguePipelineSettings();
    assert.deepEqual(settings, {
      schemaVersion: 1,
      enabled: true,
      conversationHistoryLimit: 12,
      psychologyGuidance: DEFAULT_DIALOGUE_PSYCHOLOGY_GUIDANCE,
      revision: 0,
      updatedAt: null,
      updatedBy: null,
    });
  });

  it("persists one administrator revision and rejects stale saves", async () => {
    getDb().prepare(
      `INSERT INTO users (id, username, password_hash, created_at)
       VALUES (?, ?, 'x', ?)`,
    ).run("operator", "operator", "2026-08-09T00:00:00.000Z");

    const saved = await settingsRepo.updateDialoguePipelineSettings({
      userId: "operator",
      patch: {
        expectedRevision: 0,
        enabled: true,
        conversationHistoryLimit: 20,
        psychologyGuidance: "相手の反応を受け止め、性格に沿って次の言葉を考える。",
      },
    });
    assert.ok(saved);
    assert.equal(saved.revision, 1);
    assert.equal(saved.conversationHistoryLimit, 20);
    assert.equal(saved.updatedBy, "operator");

    const stale = await settingsRepo.updateDialoguePipelineSettings({
      userId: "operator",
      patch: {
        expectedRevision: 0,
        enabled: false,
        conversationHistoryLimit: 4,
        psychologyGuidance: "上書きしてはいけない。",
      },
    });
    assert.equal(stale, null);

    const current = await settingsRepo.getDialoguePipelineSettings();
    assert.equal(current.revision, 1);
    assert.equal(current.enabled, true);
    assert.equal(current.conversationHistoryLimit, 20);
    assert.equal(
      current.psychologyGuidance,
      "相手の反応を受け止め、性格に沿って次の言葉を考える。",
    );
  });
});
