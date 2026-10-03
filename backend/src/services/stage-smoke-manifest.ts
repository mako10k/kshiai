// R: Load a strictly typed Stage smoke manifest from an explicitly selected local file.
import { readFileSync } from "node:fs";
import { isAbsolute } from "node:path";
import { StageSmokeManifestSchema } from "./cutover-stage-smoke.js";

export function readStageSmokeManifest(path: string | undefined) {
  if (!path || !isAbsolute(path)) throw new Error("absolute STAGE_SMOKE_MANIFEST_FILE is required");
  const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
  return StageSmokeManifestSchema.parse(parsed);
}
