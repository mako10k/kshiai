#!/usr/bin/env node

import { pathToFileURL } from "node:url";

async function request(url, init) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
}

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return Number(value);
}

function describeHealth(status, body) {
  return `status=${status}, revision=${String(body?.revision)}`;
}

export async function waitForExpectedHealth({
  url,
  expectedRevision,
  attempts = 12,
  delayMs = 5_000,
  fetchHealth = request,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  observe = (message) => console.warn(message),
}) {
  const observations = [];
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const response = await fetchHealth(url, { redirect: "error" });
    const body = response.ok ? await response.json() : null;
    const valid =
      response.ok &&
      body?.ok === true &&
      body.database === "postgres" &&
      body.auth === "supabase";
    const matched = !expectedRevision || body?.revision === expectedRevision;
    const observation = describeHealth(response.status, body);
    observations.push(observation);
    if (valid && matched) return body;
    observe(`Health convergence pending (${attempt}/${attempts}): ${observation}`);
    if (attempt < attempts) await wait(delayMs);
  }
  throw new Error(
    `Health did not converge to ${String(expectedRevision)}: ${observations.join("; ")}`,
  );
}

async function main() {
  const publicUrl = process.argv[2]?.replace(/\/$/, "");
  const directUrl = process.argv[3]?.replace(/\/$/, "");
  const expectedRevision = process.argv[4]?.trim() || null;
  if (!publicUrl) {
    throw new Error(
      "Usage: smoke-deployment.mjs PUBLIC_URL [DIRECT_URL] [EXPECTED_REVISION]",
    );
  }
  const attempts = parsePositiveInteger(
    process.env.SMOKE_CONVERGENCE_ATTEMPTS,
    12,
    "SMOKE_CONVERGENCE_ATTEMPTS",
  );
  const delayMs = parsePositiveInteger(
    process.env.SMOKE_CONVERGENCE_DELAY_MS,
    5_000,
    "SMOKE_CONVERGENCE_DELAY_MS",
  );
  const page = await request(`${publicUrl}/`, { redirect: "error" });
  if (!page.ok || !page.headers.get("content-type")?.startsWith("text/html")) {
    throw new Error(`Frontend smoke failed: ${page.status}`);
  }
  if (page.headers.get("x-kshiai-runtime") !== "cloudflare-worker") {
    throw new Error("Frontend response is missing the Cloudflare Worker runtime marker");
  }

  await waitForExpectedHealth({
    url: `${publicUrl}/api/health`,
    expectedRevision,
    attempts,
    delayMs,
  });

  if (directUrl) {
    const direct = await request(`${directUrl}/api/health`, { redirect: "error" });
    if (direct.status !== 404) {
      throw new Error(
        `Direct Cloud Run origin must fail closed with 404, received ${direct.status}`,
      );
    }
  }

  console.log(`Deployment smoke passed: ${publicUrl}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
