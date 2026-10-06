// R: Bind fenced awareness initialization parameters independently for each storage column type.
export function awarenessRuntimeInitializationQuery(input: {
  battleId: string;
  ownerId: string;
  fencingToken: number;
  runtimeJson: string;
  now: string;
}): {
  text: string;
  values: [string, string, number, string, string, number, string];
} {
  return {
    text: `INSERT INTO battle_awareness_runtime (battle_id, revision, fencing_token, runtime_json, updated_at)
     SELECT $1, 0, $3, $4, $5 WHERE EXISTS (
       SELECT 1 FROM battle_leases WHERE battle_id = $1 AND owner_id = $2
         AND fencing_token = $6 AND expires_at > $7
     ) ON CONFLICT (battle_id) DO NOTHING RETURNING battle_id`,
    // PostgreSQL leases use bigint/timestamptz, while snapshots use integer/text.
    // Separate bindings preserve the same values without imposing one inferred SQL type.
    values: [input.battleId, input.ownerId, input.fencingToken, input.runtimeJson,
      input.now, input.fencingToken, input.now],
  };
}
