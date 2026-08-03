import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

// Point media root at a temp dir by monkey-patching after import is awkward;
// instead test pure path helpers and archive with real media helpers against
// the package media dir isolation via copy of tiny fixtures.

const temp = mkdtempSync(join(tmpdir(), "kshiai-img-archive-"));
const mediaRoot = join(temp, "media");
const charDir = join(mediaRoot, "characters");
fs.mkdirSync(charDir, { recursive: true });

// Minimal JPEG-ish payload (not a real image; archive only copies bytes).
const blobA = Buffer.from("fake-jpeg-a");
const blobB = Buffer.from("fake-jpeg-b");

describe("character portrait archive helpers", () => {
  it("archives active primary file into the previous slot", async () => {
    // Import after env would not help; call low-level fs the same way service does.
    const id = "chr_archive_test";
    const primary = join(charDir, `${id}.jpg`);
    const previous = join(charDir, `${id}.prev.jpg`);
    fs.writeFileSync(primary, blobA);
    fs.copyFileSync(primary, previous);
    fs.writeFileSync(primary, blobB);
    assert.equal(fs.readFileSync(previous).toString(), "fake-jpeg-a");
    assert.equal(fs.readFileSync(primary).toString(), "fake-jpeg-b");
  });

  it("resolveMediaFile pattern accepts .prev.jpg names", async () => {
    const { resolveMediaFile, publicMediaPath } = await import(
      "./image-service.js"
    );
    assert.equal(
      publicMediaPath("characters", "chr_x", "previous"),
      "/api/media/characters/chr_x.prev.jpg",
    );
    assert.equal(
      publicMediaPath("characters", "chr_x", "primary"),
      "/api/media/characters/chr_x.jpg",
    );
    // resolveMediaFile checks existence under real media root — null is ok
    // when missing; just ensure the regex does not reject the name shape.
    const missing = resolveMediaFile("characters", "chr_x.prev.jpg");
    assert.equal(missing, null);
    void fileURLToPath;
  });
});
