import type { AccountKind, UserAccessProfile } from "../account-access.js";
import { setAccountKind } from "../account-access.js";
import { config } from "../config.js";
import { query } from "../db.js";
import { E2E_ACCOUNT_EMAILS } from "../e2e-observer.js";
import {
  ensureAuthUser,
  generateEphemeralPassword,
} from "../e2e-supabase-admin.js";

export const E2E_SESSION_AUDIT_KIND = "e2e_session_mint";

export const E2E_SESSION_TARGETS = {
  observer: {
    email: E2E_ACCOUNT_EMAILS.observer,
    accountKind: "e2e" as const,
  },
  opponent: {
    email: E2E_ACCOUNT_EMAILS.opponent,
    accountKind: "test" as const,
  },
} as const;

export type E2eSessionTargetName = keyof typeof E2E_SESSION_TARGETS;

export function canMintE2eSession(
  viewer: Pick<UserAccessProfile, "isAdmin" | "accountKind">,
): boolean {
  return viewer.isAdmin || viewer.accountKind === "developer";
}

export async function rotateE2ePassword(email: string, password: string): Promise<void> {
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    throw new Error("E2E_SESSION_UNAVAILABLE");
  }
  await ensureAuthUser({
    email,
    password,
    secretKey: config.supabaseSecretKey,
  });
}

export async function mintE2eSession(input: {
  operatorUserId: string;
  target: E2eSessionTargetName;
  rotatePassword?: (email: string, password: string) => Promise<void>;
  now?: string;
}): Promise<{ email: string; password: string; accountKind: AccountKind }> {
  const spec = E2E_SESSION_TARGETS[input.target];
  const mapped = await query<{ id: string }>(
    `SELECT id FROM users WHERE lower(email) = lower($1)`,
    [spec.email],
  );
  const applicationUserId = mapped.rows[0]?.id;
  if (!applicationUserId) throw new Error("E2E_SESSION_FIXTURE_MISSING");

  const password = generateEphemeralPassword();
  await (input.rotatePassword ?? rotateE2ePassword)(spec.email, password);
  await setAccountKind(applicationUserId, spec.accountKind);
  await query(
    `INSERT INTO balance_events
      (kind, created_at, battle_id, character_id, payload_json)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      E2E_SESSION_AUDIT_KIND,
      input.now ?? new Date().toISOString(),
      null,
      null,
      JSON.stringify({
        target: input.target,
        operatorUserId: input.operatorUserId,
      }),
    ],
  );
  return {
    email: spec.email,
    password,
    accountKind: spec.accountKind,
  };
}

export async function listE2eSessionAudits(): Promise<Array<{
  kind: string;
  created_at: string;
  payload: Record<string, unknown>;
}>> {
  const result = await query<{
    kind: string;
    created_at: string | Date;
    payload_json: string;
  }>(
    `SELECT kind, created_at, payload_json
       FROM balance_events
      WHERE kind = $1
      ORDER BY created_at ASC`,
    [E2E_SESSION_AUDIT_KIND],
  );
  return result.rows.map((row) => ({
    kind: row.kind,
    created_at: typeof row.created_at === "string"
      ? row.created_at
      : row.created_at.toISOString(),
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
  }));
}
