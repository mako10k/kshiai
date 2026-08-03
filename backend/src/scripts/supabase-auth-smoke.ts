import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { closeDatabase, query } from "../db.js";
import { userFromSupabaseAccessToken } from "../auth.js";

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function authRequest(
  path: string,
  key: string,
  init: RequestInit,
): Promise<Response> {
  return fetch(`${config.supabaseUrl}/auth/v1${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });
}

async function main(): Promise<void> {
  const secretKey = required("SUPABASE_SECRET_KEY");
  const publishableKey = required("SUPABASE_PUBLISHABLE_KEY");
  required("DATABASE_URL");
  const marker = randomUUID();
  const email = `auth-smoke-${marker}@example.test`;
  const password = `Smoke-${randomUUID()}-9a!`;
  let authUserId: string | null = null;
  let applicationUserId: string | null = null;

  try {
    const created = await authRequest("/admin/users", secretKey, {
      method: "POST",
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    if (!created.ok) throw new Error(`Supabase admin create failed: ${created.status}`);
    const createdBody = await created.json() as { id?: string };
    if (!createdBody.id) throw new Error("Supabase admin create returned no user ID");
    authUserId = createdBody.id;

    const signedIn = await authRequest("/token?grant_type=password", publishableKey, {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!signedIn.ok) throw new Error(`Supabase password sign-in failed: ${signedIn.status}`);
    const session = await signedIn.json() as { access_token?: string };
    if (!session.access_token) throw new Error("Supabase sign-in returned no access token");

    const applicationUser = await userFromSupabaseAccessToken(session.access_token);
    if (!applicationUser) throw new Error("Backend JWT verification failed");
    applicationUserId = applicationUser.id;
    const mapped = await query<{ auth_user_id: string; email: string }>(
      `SELECT auth_user_id, email FROM users WHERE id = $1`,
      [applicationUser.id],
    );
    if (mapped.rows[0]?.auth_user_id !== authUserId || mapped.rows[0]?.email !== email) {
      throw new Error("Application user mapping mismatch");
    }
    const apiBaseUrl = process.env.AUTH_SMOKE_API_URL?.replace(/\/$/, "");
    if (apiBaseUrl) {
      const originSecret = process.env.AUTH_SMOKE_ORIGIN_SECRET?.trim();
      const apiResponse = await fetch(`${apiBaseUrl}/api/me`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          ...(originSecret ? { "x-kshiai-origin": originSecret } : {}),
        },
        signal: AbortSignal.timeout(15_000),
      });
      if (!apiResponse.ok) {
        const detail = (await apiResponse.text()).slice(0, 200);
        throw new Error(`Authenticated API smoke failed: ${apiResponse.status}: ${detail}`);
      }
      const apiBody = await apiResponse.json() as { user?: { id?: string } };
      if (apiBody.user?.id !== applicationUser.id) {
        throw new Error("Authenticated API returned another application user");
      }
      if (process.env.AUTH_SMOKE_SSE === "1") {
        const streamResponse = await fetch(
          `${apiBaseUrl}/api/battles/btl_auth_smoke_missing/advance/stream`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.access_token}`,
              "Idempotency-Key": `auth-smoke-${marker}`,
              ...(originSecret ? { "x-kshiai-origin": originSecret } : {}),
            },
            signal: AbortSignal.timeout(15_000),
          },
        );
        if (!streamResponse.ok) {
          const detail = (await streamResponse.text()).slice(0, 200);
          throw new Error(`Authenticated SSE smoke failed: ${streamResponse.status}: ${detail}`);
        }
        if (!streamResponse.headers.get("content-type")?.startsWith("text/event-stream")) {
          throw new Error("Authenticated SSE smoke returned another content type");
        }
        const streamBody = await streamResponse.text();
        if (!streamBody.includes(": stream-open") ||
          !streamBody.includes('"type":"error"') ||
          !streamBody.includes("BATTLE_NOT_FOUND")) {
          throw new Error("Authenticated SSE smoke returned an incomplete event stream");
        }
      }
    }
    console.log(
      process.env.AUTH_SMOKE_SSE === "1"
        ? "Supabase Auth JWT, application-user mapping, and SSE proxy smoke passed"
        : "Supabase Auth JWT and application-user mapping smoke passed",
    );
  } finally {
    if (applicationUserId) {
      await query(`DELETE FROM users WHERE id = $1`, [applicationUserId]);
    }
    if (authUserId) {
      const removed = await authRequest(`/admin/users/${authUserId}`, secretKey, {
        method: "DELETE",
      });
      if (!removed.ok) throw new Error(`Supabase auth cleanup failed: ${removed.status}`);
    }
    await closeDatabase();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
