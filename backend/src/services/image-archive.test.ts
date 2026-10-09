import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, type TestContext } from "node:test";
import { CharacterSheetSchema, defaultParameters } from "@kshiai/shared";
import { archiveActiveCharacterPortrait, publicMediaPath, resolveMediaFile } from "./image-service.js";
import { createLocalMediaStore, type LocalMediaArchiveEvent } from "./local-media-store.js";

function fixture(t: TestContext) {
  const temp = mkdtempSync(join(tmpdir(), "kshiai-img-archive-"));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const events: LocalMediaArchiveEvent[] = [];
  const store = createLocalMediaStore(join(temp, "media"), (event) => events.push(event));
  return { charDir: store.mediaDir("characters"), store, events };
}

function character(id: string, imageUrl?: string) {
  return CharacterSheetSchema.parse({
    id,
    ownerUserId: "archive-test-owner",
    displayName: "画像保存テスト成人",
    tags: [],
    createdAt: "2026-08-03T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    appearance: { summary: "成人", visualPrompt: "adult", imageUrl },
    traits: [],
    parameters: defaultParameters(),
    skills: [],
    weapon: null,
    armor: null,
    combatFlags: { canFight: true, irreversibleIncapacitated: false },
    narrativeBlurb: "画像保存用fixture",
  });
}

// Minimal JPEG-ish payload (not a real image; archive only copies bytes).
const blobA = Buffer.from("fake-jpeg-a");
const blobB = Buffer.from("fake-jpeg-b");

describe("character portrait archive helpers", () => {
  it("archives active primary file into the previous slot", async (t) => {
    const { charDir, store } = fixture(t);
    const id = "chr_archive_test";
    const primary = join(charDir, `${id}.jpg`);
    const previous = join(charDir, `${id}.prev.jpg`);
    fs.writeFileSync(primary, blobA);
    assert.equal(
      archiveActiveCharacterPortrait(character(id), store),
      `/api/media/characters/${id}.prev.jpg`,
    );
    fs.writeFileSync(primary, blobB);
    assert.equal(fs.readFileSync(previous).toString(), "fake-jpeg-a");
    assert.equal(fs.readFileSync(primary).toString(), "fake-jpeg-b");
  });

  it("resolveMediaFile pattern accepts .prev.jpg names", async (t) => {
    const { charDir, store } = fixture(t);
    assert.equal(
      publicMediaPath("characters", "chr_x", "previous"),
      "/api/media/characters/chr_x.prev.jpg",
    );
    assert.equal(
      publicMediaPath("characters", "chr_x", "primary"),
      "/api/media/characters/chr_x.jpg",
    );
    const missing = resolveMediaFile("characters", "chr_x.prev.jpg", store);
    assert.equal(missing, null);
    const previous = join(charDir, "chr_x.prev.jpg");
    fs.writeFileSync(previous, blobA);
    assert.equal(resolveMediaFile("characters", "chr_x.prev.jpg", store), previous);
  });

  it("archives the active revision URL instead of the primary fallback", async (t) => {
    const { charDir, store, events } = fixture(t);
    const id = "chr_archive_revision";
    fs.writeFileSync(join(charDir, `${id}.jpg`), blobB);
    fs.writeFileSync(join(charDir, `${id}.img-active.jpg`), blobA);
    const previousUrl = archiveActiveCharacterPortrait(
      character(id, `/api/media/characters/${id}.img-active.jpg`), store,
    );
    assert.equal(previousUrl, `/api/media/characters/${id}.prev.jpg`);
    assert.equal(fs.readFileSync(join(charDir, `${id}.prev.jpg`)).toString(), "fake-jpeg-a");
    assert.deepEqual(events, [{ phase: "archived_previous", ok: true, characterId: id, previousUrl }]);
  });

  it("returns null without an archive when the active file is missing", async (t) => {
    const { charDir, store, events } = fixture(t);
    assert.equal(archiveActiveCharacterPortrait(character("chr_missing"), store), null);
    assert.equal(fs.existsSync(join(charDir, "chr_missing.prev.jpg")), false);
    assert.deepEqual(events, []);
  });
});
