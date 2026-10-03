// R: Verify Supabase access tokens and extract identity without provisioning application users.
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export type SupabaseIdentity = {
  subject: string;
  email: string | null;
  displayName: string | null;
};

export function createSupabaseIdentityVerifier(
  settings: { supabaseUrl: string; supabaseJwksUrl: string },
  keyResolver?: JWTVerifyGetKey,
): (token: string | undefined) => Promise<SupabaseIdentity | null> {
  const keys = keyResolver ?? (settings.supabaseJwksUrl
    ? createRemoteJWKSet(new URL(settings.supabaseJwksUrl)) : null);
  return async (token) => {
    if (!token || !settings.supabaseUrl || !keys) return null;
    try {
      const { payload } = await jwtVerify(token, keys, {
        algorithms: ["ES256"],
        issuer: `${settings.supabaseUrl}/auth/v1`,
        audience: "authenticated",
      });
      if (typeof payload.sub !== "string" || payload.role !== "authenticated") return null;
      const metadata = payload.user_metadata;
      const displayName = metadata && typeof metadata === "object"
        ? ["full_name", "name", "user_name"]
          .map((key) => Reflect.get(metadata, key))
          .find((value): value is string => typeof value === "string" && value.trim().length > 0) ?? null
        : null;
      return {
        subject: payload.sub,
        email: typeof payload.email === "string" ? payload.email : null,
        displayName,
      };
    } catch {
      return null;
    }
  };
}
