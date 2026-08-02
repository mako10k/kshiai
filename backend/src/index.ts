import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { config } from "./config.js";
import { getDb } from "./db.js";
import { ensureSystemPresets } from "./repositories/battlefields.js";
import { buildRoutes } from "./routes.js";

// Ensure DB is ready + system battlefield presets
getDb();
ensureSystemPresets();

const app = new Hono();
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
  `kshiai API listening on http://${config.host}:${config.port} (llm=${config.llmProvider})`,
);

serve({
  fetch: app.fetch,
  hostname: config.host,
  port: config.port,
});
