import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

function loadEnvFile(filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvFile(path.resolve(process.cwd(), ".env"));
loadEnvFile(path.resolve(root, ".env"));


const defaultCors = [
  "http://127.0.0.1:5188",
  "http://localhost:5188",
  "https://kshiai.mk10.org",
];

function parseCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGIN ?? defaultCors.join(",");
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : defaultCors;
}

export const config = {
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3088),
  databasePath: path.resolve(
    process.cwd(),
    process.env.DATABASE_PATH ?? path.join(root, "data/kshiai.db"),
  ),
  sessionSecret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
  /** Comma-separated list supported via CORS_ORIGIN. */
  corsOrigins: parseCorsOrigins(),
  /** @deprecated use corsOrigins */
  corsOrigin: parseCorsOrigins()[0] ?? "http://127.0.0.1:5188",
  /** Set true behind HTTPS (Cloudflare Tunnel). */
  cookieSecure:
    process.env.COOKIE_SECURE === "1" ||
    process.env.COOKIE_SECURE === "true" ||
    process.env.NODE_ENV === "production",
  llmProvider: (process.env.LLM_PROVIDER ?? "mock") as "mock" | "xai" | "venice",
  xai: {
    apiKey: process.env.XAI_API_KEY ?? "",
    baseUrl: process.env.XAI_BASE_URL ?? "https://api.x.ai/v1",
    /** @deprecated use modelEngine */
    model: process.env.XAI_MODEL ?? "grok-4.5",
    /**
     * Engine tier: character/battlefield generation, policies, referee.
     * Prefer stronger / more accurate models.
     */
    modelEngine:
      process.env.XAI_MODEL_ENGINE ?? process.env.XAI_MODEL ?? "grok-4.5",
    /**
     * Fast tier: turn narration, aftermath, situation color.
     * Prefer non-reasoning / low-latency models.
     */
    modelFast:
      process.env.XAI_MODEL_FAST ?? "grok-4-fast-non-reasoning",
    imageModel: process.env.XAI_IMAGE_MODEL ?? "grok-imagine-image",
  },
  venice: {
    // secdat key name is VENICEAI_API_KEY; accept both
    apiKey: process.env.VENICE_API_KEY ?? process.env.VENICEAI_API_KEY ?? "",
    baseUrl: process.env.VENICE_BASE_URL ?? "https://api.venice.ai/api/v1",
    model: process.env.VENICE_MODEL ?? "default",
    modelEngine:
      process.env.VENICE_MODEL_ENGINE ?? process.env.VENICE_MODEL ?? "default",
    modelFast:
      process.env.VENICE_MODEL_FAST ??
      process.env.VENICE_MODEL ??
      "default",
  },
  battleTurnLimit: Number(process.env.BATTLE_TURN_LIMIT ?? 20),
};
