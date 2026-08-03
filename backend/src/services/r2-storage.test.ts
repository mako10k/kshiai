import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { buildR2ObjectKey, putR2Image, r2PublicUrl } from "./r2-storage.js";

describe("R2 media object naming", () => {
  it("uses immutable per-generation keys shared by every backend instance", () => {
    const key = buildR2ObjectKey(
      "characters",
      "char_abc-123",
      new Date("2026-08-03T12:00:00.000Z"),
      "generation-1",
    );
    assert.equal(
      key,
      "characters/char_abc-123/2026-08-03/generation-1.jpg",
    );
    assert.equal(
      r2PublicUrl("https://media.example.test/", key),
      "https://media.example.test/characters/char_abc-123/2026-08-03/generation-1.jpg",
    );
  });

  it("rejects IDs that could escape the object prefix", () => {
    assert.throws(
      () => buildR2ObjectKey("battlefields", "../escape"),
      /invalid_media_id/,
    );
  });

  it("writes a private S3 object and returns its shared public URL", async () => {
    const commands: PutObjectCommand[] = [];
    const writer = {
      async send(value: PutObjectCommand) {
        commands.push(value);
        return {};
      },
    };
    const url = await putR2Image(
      {
        kind: "battlefields",
        id: "field_1",
        body: Buffer.alloc(128, 1),
      },
      writer,
      {
        accountId: "account",
        accessKeyId: "access",
        secretAccessKey: "secret",
        bucket: "kshiai-media",
        publicBaseUrl: "https://media.example.test",
      },
    );
    assert.equal(commands[0]?.input.Bucket, "kshiai-media");
    assert.equal(commands[0]?.input.ContentType, "image/jpeg");
    assert.match(url, /^https:\/\/media\.example\.test\/battlefields\/field_1\//);
  });
});
