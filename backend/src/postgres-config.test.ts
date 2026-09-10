import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createPostgresConfig } from "./postgres-config.js";

const connectionString = "postgresql://user:password@localhost:5432/database";
const originalCaPath = process.env.POSTGRES_CA_CERT_PATH;

afterEach(() => {
  if (originalCaPath === undefined) {
    delete process.env.POSTGRES_CA_CERT_PATH;
  } else {
    process.env.POSTGRES_CA_CERT_PATH = originalCaPath;
  }
});

describe("createPostgresConfig", () => {
  it("uses the bundled CA when the override is absent", () => {
    delete process.env.POSTGRES_CA_CERT_PATH;
    assert.doesNotThrow(() => createPostgresConfig(connectionString));
  });

  it("uses the bundled CA when the override is empty", () => {
    process.env.POSTGRES_CA_CERT_PATH = "";
    assert.doesNotThrow(() => createPostgresConfig(connectionString));
  });

  it("uses the bundled CA when the override is whitespace", () => {
    process.env.POSTGRES_CA_CERT_PATH = "   ";
    assert.doesNotThrow(() => createPostgresConfig(connectionString));
  });

  it("uses a non-empty explicit override", () => {
    process.env.POSTGRES_CA_CERT_PATH = "/missing/kshiai-postgres-ca.crt";
    assert.throws(() => createPostgresConfig(connectionString));
  });
});
