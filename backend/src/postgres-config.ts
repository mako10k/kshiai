import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { ClientConfig } from "pg";

const bundledSupabaseCaPath = fileURLToPath(
  new URL("../../infra/supabase-ca-2021.crt", import.meta.url),
);

export function createPostgresConfig(connectionString: string): ClientConfig {
  const connectionUrl = new URL(connectionString);
  for (const parameter of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
    connectionUrl.searchParams.delete(parameter);
  }
  const caPath = process.env.POSTGRES_CA_CERT_PATH ?? bundledSupabaseCaPath;
  return {
    connectionString: connectionUrl.toString(),
    ssl: {
      ca: fs.readFileSync(caPath, "utf8"),
      rejectUnauthorized: true,
    },
  };
}
