import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "kshiai-asset-generations-"));
process.env.DATABASE_URL = "";
process.env.DATABASE_PATH = join(temporaryDirectory, "assets.db");

const { closeDatabase } = await import("../db.js");
const generations = await import("./asset-generations.js");

after(async () => {
  await closeDatabase();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe("immutable asset generations", () => {
  it("normalizes object keys before hashing", () => {
    assert.equal(
      generations.canonicalAssetJson({ b: 2, a: { z: 1, y: undefined } }),
      '{"a":{"z":1},"b":2}',
    );
    assert.equal(
      generations.assetContentDigest({ a: 1, b: 2 }),
      generations.assetContentDigest({ b: 2, a: 1 }),
    );
  });

  it("appends changed content and keeps historical generations readable", async () => {
    const first = await generations.createAssetGeneration({
      assetType: "character",
      assetId: "char-1",
      schemaVersion: 1,
      content: { displayName: "初代", nested: { b: 2, a: 1 } },
      createdAt: "2026-08-12T00:00:00.000Z",
    });
    const unchanged = await generations.createAssetGeneration({
      assetType: "character",
      assetId: "char-1",
      schemaVersion: 1,
      content: { nested: { a: 1, b: 2 }, displayName: "初代" },
      createdAt: "2026-08-12T00:01:00.000Z",
    });
    const second = await generations.createAssetGeneration({
      assetType: "character",
      assetId: "char-1",
      schemaVersion: 1,
      content: { displayName: "二代目", nested: { a: 1, b: 2 } },
      createdAt: "2026-08-12T00:02:00.000Z",
    });

    assert.equal(first.generation, 1);
    assert.equal(unchanged.generationId, first.generationId);
    assert.equal(second.generation, 2);
    assert.notEqual(second.generationId, first.generationId);
    assert.deepEqual(
      (await generations.getAssetGeneration(first.generationId))?.content,
      { displayName: "初代", nested: { a: 1, b: 2 } },
    );
    assert.equal(
      (await generations.getCurrentAssetGeneration("character", "char-1"))
        ?.generationId,
      second.generationId,
    );
  });
});
