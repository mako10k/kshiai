#!/usr/bin/env node

const publicUrl = process.argv[2]?.replace(/\/$/, "");
const directUrl = process.argv[3]?.replace(/\/$/, "");
if (!publicUrl) throw new Error("Usage: smoke-deployment.mjs PUBLIC_URL [DIRECT_URL]");

async function request(url, init) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
}

const page = await request(`${publicUrl}/`, { redirect: "error" });
if (!page.ok || !page.headers.get("content-type")?.startsWith("text/html")) {
  throw new Error(`Frontend smoke failed: ${page.status}`);
}
if (page.headers.get("x-kshiai-runtime") !== "cloudflare-worker") {
  throw new Error("Frontend response is missing the Cloudflare Worker runtime marker");
}

const health = await request(`${publicUrl}/api/health`, { redirect: "error" });
if (!health.ok) throw new Error(`Health smoke failed: ${health.status}`);
const body = await health.json();
if (body.ok !== true || body.database !== "postgres" || body.auth !== "supabase") {
  throw new Error(`Unexpected health payload: ${JSON.stringify(body)}`);
}

if (directUrl) {
  const direct = await request(`${directUrl}/api/health`, { redirect: "error" });
  if (direct.status !== 404) {
    throw new Error(`Direct Cloud Run origin must fail closed with 404, received ${direct.status}`);
  }
}

console.log(`Deployment smoke passed: ${publicUrl}`);
