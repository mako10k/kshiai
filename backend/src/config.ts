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


export const config = {
  host: process.env.HOST ?? "127.0.0.1",
  port: Number(process.env.PORT ?? 3088),
  databasePath: path.resolve(
    process.cwd(),
    process.env.DATABASE_PATH ?? path.join(root, "data/kshiai.db"),
  ),
  sessionSecret: process.env.SESSION_SECRET ?? "dev-secret-change-me",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://127.0.0.1:5188",
  llmProvider: (process.env.LLM_PROVIDER ?? "mock") as "mock" | "xai" | "venice",
  xai: {
    apiKey: process.env.XAI_API_KEY ?? "",
    baseUrl: process.env.XAI_BASE_URL ?? "https://api.x.ai/v1",
    model: process.env.XAI_MODEL ?? "grok-4.5",
  },
  venice: {
    apiKey: process.env.VENICE_API_KEY ?? "",
    baseUrl: process.env.VENICE_BASE_URL ?? "https://api.venice.ai/api/v1",
    model: process.env.VENICE_MODEL ?? "default",
  },
  battleTurnLimit: Number(process.env.BATTLE_TURN_LIMIT ?? 20),
};
