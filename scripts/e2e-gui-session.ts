import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const outputPath = process.argv[2];
const target = process.argv[3] === "opponent" ? "opponent" : "observer";
if (!outputPath) {
  throw new Error("Usage: tsx scripts/e2e-gui-session.ts <output-json> [observer|opponent]");
}

const { mintE2eSession } = await import("../backend/src/services/e2e-session.js");
const session = await mintE2eSession({
  operatorUserId: process.env.E2E_GUI_OPERATOR_USER_ID ?? "trusted-runner",
  target,
});
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(session)}\n`, { mode: 0o600 });
process.stdout.write(`Wrote E2E ${target} session file.\n`);
