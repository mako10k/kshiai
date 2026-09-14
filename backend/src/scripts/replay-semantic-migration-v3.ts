import { runSemanticMigrationProbe } from "./replay-semantic-migration.js";
import { SEMANTIC_MIGRATION_PROBE_RUN_V3 } from "./semantic-migration-probe-run.js";

// Separate explicit entrypoint: the original launcher still selects the consumed V2 run.
runSemanticMigrationProbe(SEMANTIC_MIGRATION_PROBE_RUN_V3).catch(() => {
  console.error("Semantic migration V3 probe stopped; inspect retained evidence. No automatic retry.");
  process.exitCode = 1;
});
