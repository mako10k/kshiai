import { randomUUID } from "node:crypto";
import { config } from "./config.js";
import { query } from "./db.js";

type SupabaseAdminUser = {
  id?: string;
  email?: string;
};

export function generateEphemeralPassword(): string {
  return `E2E-${randomUUID()}-9a!`;
}

async function readError(response: Response): Promise<string> {
  return (await response.text()).replaceAll(/\s+/g, " ").slice(0, 300);
}

export async function authRequest(
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
    signal: AbortSignal.timeout(30_000),
  });
}

export async function findAuthUserByEmail(
  email: string,
  secretKey: string,
): Promise<SupabaseAdminUser | null> {
  for (let page = 1; page <= 10; page += 1) {
    const response = await authRequest(
      `/admin/users?page=${page}&per_page=1000`,
      secretKey,
      { method: "GET" },
    );
    if (!response.ok) {
      throw new Error(`Supabase admin list failed: ${response.status}: ${await readError(response)}`);
    }
    const body = await response.json() as {
      users?: SupabaseAdminUser[];
      next_page?: number | null;
    };
    const match = body.users?.find(
      (user) => user.email?.trim().toLowerCase() === email.toLowerCase(),
    );
    if (match) return match;
    if (!body.next_page || (body.users?.length ?? 0) === 0) return null;
  }
  throw new Error("Supabase admin user pagination exceeded its safety bound");
}

export async function ensureAuthUser(input: {
  email: string;
  password: string;
  secretKey: string;
}): Promise<string> {
  const mapped = await query<{ auth_user_id: string | null }>(
    `SELECT auth_user_id FROM users WHERE lower(email) = lower($1)`,
    [input.email],
  );
  const mappedAuthId = mapped.rows[0]?.auth_user_id ?? null;
  if (mapped.rows[0] && !mappedAuthId) {
    throw new Error(`Existing application account is not Supabase-owned: ${input.email}`);
  }

  let authUserId = mappedAuthId;
  if (!authUserId) {
    const existing = await findAuthUserByEmail(input.email, input.secretKey);
    authUserId = existing?.id ?? null;
  }
  if (!authUserId) {
    const created = await authRequest("/admin/users", input.secretKey, {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        email_confirm: true,
        user_metadata: { name: input.email.split("@")[0] },
      }),
    });
    if (!created.ok) {
      throw new Error(`Supabase admin create failed: ${created.status}: ${await readError(created)}`);
    }
    authUserId = (await created.json() as SupabaseAdminUser).id ?? null;
    if (!authUserId) throw new Error("Supabase admin create returned no user ID");
    return authUserId;
  }

  const updated = await authRequest(`/admin/users/${authUserId}`, input.secretKey, {
    method: "PUT",
    body: JSON.stringify({
      password: input.password,
      email_confirm: true,
      user_metadata: { name: input.email.split("@")[0] },
    }),
  });
  if (!updated.ok) {
    throw new Error(`Supabase admin update failed: ${updated.status}: ${await readError(updated)}`);
  }
  return authUserId;
}
