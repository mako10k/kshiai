import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.js";
import { databaseKind, initializeDatabase } from "./db.js";
import { ensureSystemPresets } from "./repositories/battlefields.js";
import { ensureSystemNarrationStyles } from "./repositories/narration-styles.js";
import { buildRoutes } from "./routes.js";
import { dispatchPendingNarrationTasks } from "./services/narration-task-dispatch.js";
import {
  ORIGIN_VERIFICATION_HEADER,
  verifyOriginSecret,
} from "./origin-verification.js";

// Ensure DB is ready + system battlefield presets
await initializeDatabase();
await Promise.all([ensureSystemPresets(), ensureSystemNarrationStyles()]);
try {
  const narrationDispatch = await dispatchPendingNarrationTasks();
  if (narrationDispatch.failed > 0) {
    console.error("[narration] startup task dispatch incomplete", narrationDispatch);
  }
} catch (error) {
  // Durable outbox rows remain pending and are retried on the next startup or
  // battle mutation. Readiness is not coupled to a transient Cloud Tasks call.
  console.error("[narration] startup task dispatch failed", error);
}

const app = new Hono();
app.use("/api/*", async (c, next) => {
  if (c.req.path === "/api/internal/narration/task") {
    await next();
    return;
  }
  if (!verifyOriginSecret(
    config.originSharedSecret,
    c.req.header(ORIGIN_VERIFICATION_HEADER),
  )) {
    return c.json({ error: "not_found" }, 404);
  }
  await next();
});
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return config.corsOrigins[0] ?? "*";
      return config.corsOrigins.includes(origin) ? origin : null;
    },
    credentials: true,
  }),
);
app.route("/", buildRoutes());

app.onError((err, c) => {
  console.error(err);
  if (err.name === "ZodError") {
    return c.json({ error: "validation_error", details: err }, 400);
  }
  return c.json({ error: "internal_error", message: err.message }, 500);
});

console.log(
  `kshiai API listening on http://${config.host}:${config.port} (llm=${config.llmProvider}, db=${databaseKind()})`,
);

serve({
  fetch: app.fetch,
  hostname: config.host,
  port: config.port,
});
