// R: Verify the shared Supabase identity boundary with signed tokens and no external services.
import assert from "node:assert/strict";
import { it } from "node:test";
import { generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { createSupabaseIdentityVerifier } from "./supabase-identity.js";

const keys = await generateKeyPair("ES256");
const settings = { supabaseUrl: "https://identity.example.test", supabaseJwksUrl: "" };
const verify = createSupabaseIdentityVerifier(settings, async () => keys.publicKey);
async function token(payload: JWTPayload, issuer = `${settings.supabaseUrl}/auth/v1`, audience = "authenticated") {
  return new SignJWT(payload).setProtectedHeader({ alg: "ES256" })
    .setIssuer(issuer).setAudience(audience).setExpirationTime("5m").sign(keys.privateKey);
}
it("extracts a signed identity without any application database dependency", async () => {
  assert.deepEqual(await verify(await token({ sub: "fixed-subject", role: "authenticated",
    email: "owner@example.test", user_metadata: { full_name: "Owner" } })),
  { subject: "fixed-subject", email: "owner@example.test", displayName: "Owner" });
});
it("rejects wrong issuer, audience, role and absent subject", async () => {
  const claims = { sub: "subject", role: "authenticated" };
  assert.equal(await verify(await token(claims, "https://other.example.test/auth/v1")), null);
  assert.equal(await verify(await token(claims, undefined, "other")), null);
  assert.equal(await verify(await token({ ...claims, role: "anon" })), null);
  assert.equal(await verify(await token({ role: "authenticated" })), null);
});
it("rejects a token signed by a different key and missing configuration", async () => {
  const other = await generateKeyPair("ES256");
  const signed = await new SignJWT({ sub: "subject", role: "authenticated" })
    .setProtectedHeader({ alg: "ES256" }).setIssuer(`${settings.supabaseUrl}/auth/v1`)
    .setAudience("authenticated").setExpirationTime("5m").sign(other.privateKey);
  assert.equal(await verify(signed), null);
  assert.equal(await verify(undefined), null);
  assert.equal(await createSupabaseIdentityVerifier({ supabaseUrl: "", supabaseJwksUrl: "" })(signed), null);
});

it("rejects an expired token with otherwise valid identity claims", async () => {
  const expired = await new SignJWT({ sub: "subject", role: "authenticated" })
    .setProtectedHeader({ alg: "ES256" })
    .setIssuer(`${settings.supabaseUrl}/auth/v1`)
    .setAudience("authenticated")
    .setExpirationTime(1)
    .sign(keys.privateKey);
  assert.equal(await verify(expired), null);
});
