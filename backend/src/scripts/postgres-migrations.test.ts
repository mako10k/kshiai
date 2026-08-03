import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listMigrationFiles } from "./postgres-migrations.js";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("PostgreSQL migration discovery", () => {
  it("sorts migrations and produces stable SHA-256 checksums", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kshiai-pg-migrations-"));
    temporaryDirectories.push(directory);
    fs.writeFileSync(path.join(directory, "0002_second.sql"), "SELECT 2;\n");
    fs.writeFileSync(path.join(directory, "0001_first.sql"), "SELECT 1;\n");
    fs.writeFileSync(path.join(directory, "README.md"), "ignored\n");

    const first = listMigrationFiles(directory);
    const second = listMigrationFiles(directory);

    assert.deepEqual(
      first.map((migration) => migration.name),
      ["0001_first.sql", "0002_second.sql"],
    );
    assert.match(first[0]?.checksum ?? "", /^[a-f0-9]{64}$/);
    assert.equal(first[0]?.checksum, second[0]?.checksum);
  });
});
