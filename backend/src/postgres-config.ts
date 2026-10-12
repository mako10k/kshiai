import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { Pool, type ClientConfig, type PoolConfig } from "pg";

const bundledSupabaseCaPath = fileURLToPath(
  new URL("../../infra/supabase-ca-2021.crt", import.meta.url),
);

export function createPostgresConfig(connectionString: string): ClientConfig {
  const connectionUrl = new URL(connectionString);
  for (const parameter of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) {
    connectionUrl.searchParams.delete(parameter);
  }
  const caPath = process.env.POSTGRES_CA_CERT_PATH?.trim() || bundledSupabaseCaPath;
  return {
    connectionString: connectionUrl.toString(),
    ssl: {
      ca: fs.readFileSync(caPath, "utf8"),
      rejectUnauthorized: true,
    },
  };
}

// Idle clients are already removed by pg-pool before this event is emitted.
// Do not log the error/client: they can carry connection credentials.
export function createPostgresPool(options: PoolConfig): Pool {
  const pool = new Pool(options);
  pool.on("error", () => {
    console.error("[database] Idle PostgreSQL connection lost; pool will replace it");
  });
  return pool;
}
