// Pure identity data: safe to import before the launcher isolates database settings.
export type SemanticMigrationProbeRun = {
  readonly runId: string;
  readonly promptIdentity: string;
};

export const SEMANTIC_MIGRATION_PROBE_RUN_V2 = Object.freeze({
  runId: "semantic-migration-grok-2026-09-10-v2",
  promptIdentity: "character-semantic-migration-prompt-v2",
});
