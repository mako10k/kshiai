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

function parseBoolean(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

export type BattleCausalNarrationMode = "off" | "narration_guarded";

export function parseBattleCausalNarrationMode(
  value: string | undefined,
): BattleCausalNarrationMode {
  const normalized = value?.trim().toLowerCase() || "off";
  if (normalized === "off" || normalized === "narration_guarded") {
    return normalized;
  }
  throw new Error(
    "BATTLE_CAUSAL_NARRATION_MODE must be off or narration_guarded",
  );
}

function parseDatabaseSchema(value: string | undefined): string {
  const schema = value?.trim() || "public";
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) {
    throw new Error("DATABASE_SCHEMA must be a safe PostgreSQL identifier");
  }
  return schema;
}

const llmProvider = (process.env.LLM_PROVIDER ?? "mock") as
  | "mock"
  | "xai"
  | "openai"
  | "venice";
const databaseUrl = process.env.DATABASE_URL?.trim() || null;
if (process.env.NODE_ENV === "production" && !databaseUrl) {
  throw new Error("DATABASE_URL is required when NODE_ENV=production");
}
const supabaseUrl = process.env.SUPABASE_URL?.trim().replace(/\/$/, "") ?? "";
const supabaseJwksUrl = process.env.SUPABASE_JWKS_URL?.trim() ||
  (supabaseUrl ? `${supabaseUrl}/auth/v1/.well-known/jwks.json` : "");
const authProvider = process.env.AUTH_PROVIDER?.trim().toLowerCase() ||
  (supabaseUrl ? "supabase" : "legacy");
if (authProvider !== "legacy" && authProvider !== "supabase") {
  throw new Error("AUTH_PROVIDER must be legacy or supabase");
}
if (authProvider === "supabase" && (!supabaseUrl || !supabaseJwksUrl)) {
  throw new Error("SUPABASE_URL and SUPABASE_JWKS_URL are required for Supabase Auth");
}
if (process.env.NODE_ENV === "production" && authProvider !== "supabase") {
  throw new Error("AUTH_PROVIDER=supabase is required when NODE_ENV=production");
}

const r2 = {
  accountId: process.env.R2_ACCOUNT_ID?.trim() ?? "",
  accessKeyId: process.env.R2_ACCESS_KEY_ID?.trim() ?? "",
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY?.trim() ?? "",
  bucket: process.env.R2_BUCKET?.trim() ?? "",
  publicBaseUrl: (process.env.R2_PUBLIC_BASE_URL?.trim() ?? "").replace(/\/$/, ""),
};
const r2Configured = Object.values(r2).every(Boolean);
const mediaStorage = process.env.MEDIA_STORAGE?.trim().toLowerCase() ||
  (r2Configured ? "r2" : "local");
if (mediaStorage !== "local" && mediaStorage !== "r2") {
  throw new Error("MEDIA_STORAGE must be local or r2");
}
if (mediaStorage === "r2" && !r2Configured) {
  throw new Error("All R2_* settings are required when MEDIA_STORAGE=r2");
}
if (process.env.NODE_ENV === "production" && mediaStorage !== "r2") {
  throw new Error("MEDIA_STORAGE=r2 is required when NODE_ENV=production");
}

export function isMockProviderAllowed(input: {
  nodeEnv: string | undefined;
  primaryProvider: string;
  allowMockFallback: boolean;
}): boolean {
  return input.nodeEnv !== "production" &&
    (input.primaryProvider === "mock" || input.allowMockFallback);
}

export const config = {
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3088),
  databasePath: path.resolve(
    process.cwd(),
    process.env.DATABASE_PATH ?? path.join(root, "data/kshiai.db"),
  ),
  databaseUrl,
  databaseSchema: parseDatabaseSchema(process.env.DATABASE_SCHEMA),
  databasePoolMax: Math.max(1, Number(process.env.DATABASE_POOL_MAX ?? 10)),
  authProvider: authProvider as "legacy" | "supabase",
  adminUserIds: (process.env.ADMIN_USER_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
  adminEmails: (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean),
  supabaseUrl,
  supabaseJwksUrl,
  mediaStorage: mediaStorage as "local" | "r2",
  r2,
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
  originSharedSecret: process.env.ORIGIN_SHARED_SECRET?.trim() ?? "",
  llmProvider,
  allowMockProvider: isMockProviderAllowed({
    nodeEnv: process.env.NODE_ENV,
    primaryProvider: llmProvider,
    allowMockFallback: parseBoolean(process.env.ALLOW_MOCK_FALLBACK),
  }),
  /** Ordered providers. Legacy LLM_PROVIDER remains the first choice. */
  llmProviderOrder: (process.env.LLM_PROVIDER_ORDER ??
    (llmProvider === "mock"
      ? "mock"
      : `${llmProvider},openai,venice`))
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value, index, values) =>
      ["xai", "openai", "venice", "mock"].includes(value) &&
      values.indexOf(value) === index,
    ) as Array<"xai" | "openai" | "venice" | "mock">,
  imageProviderOrder: (process.env.IMAGE_PROVIDER_ORDER ?? "xai,venice")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter((value, index, values) =>
      ["xai", "venice"].includes(value) && values.indexOf(value) === index,
    ) as Array<"xai" | "venice">,
  llmProviderCooldownMs: Math.max(
    60_000,
    Number(
      process.env.LLM_PROVIDER_COOLDOWN_MS ??
        process.env.LLM_QUOTA_COOLDOWN_MS ??
        60 * 60 * 1000,
    ),
  ),
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
     * Fast tier: narration, agent continuity, identity extraction,
     * battlefield drafting/concretization, and coarse policy choices.
     * Prefer non-reasoning / low-latency models.
     */
    modelFast:
      process.env.XAI_MODEL_FAST ?? "grok-4-fast-non-reasoning",
    imageModel: process.env.XAI_IMAGE_MODEL ?? "grok-imagine-image",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? "",
    baseUrl: process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
    modelEngine: process.env.OPENAI_MODEL_ENGINE ?? "gpt-4.1",
    modelFast: process.env.OPENAI_MODEL_FAST ?? "gpt-4.1-mini",
  },
  venice: {
    // secdat key name is VENICEAI_API_KEY; accept both
    apiKey: process.env.VENICE_API_KEY ?? process.env.VENICEAI_API_KEY ?? "",
    baseUrl: process.env.VENICE_BASE_URL ?? "https://api.venice.ai/api/v1",
    model: process.env.VENICE_MODEL ?? "qwen-3-7-plus",
    modelEngine:
      process.env.VENICE_MODEL_ENGINE ?? process.env.VENICE_MODEL ?? "qwen-3-7-plus",
    modelFast:
      process.env.VENICE_MODEL_FAST ??
      process.env.VENICE_MODEL ??
      "gemini-3-5-flash-lite",
    imageModel: process.env.VENICE_IMAGE_MODEL ?? "",
  },
  battleTurnLimit: Number(process.env.BATTLE_TURN_LIMIT ?? 20),
  battleCausalNarrationMode: parseBattleCausalNarrationMode(
    process.env.BATTLE_CAUSAL_NARRATION_MODE,
  ),
};
