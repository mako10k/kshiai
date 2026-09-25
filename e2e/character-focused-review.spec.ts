import { expect, test } from "@playwright/test";
import type { CharacterAuthoringReview } from "@kshiai/shared";
import { e2eGuiMe } from "./fixtures/battle";

test.use({ launchOptions: { executablePath: process.env.E2E_CHROMIUM_EXECUTABLE } });

const base: CharacterAuthoringReview = {
  attemptId: "focused-review", characterId: "focused-character", kind: "create",
  status: "failed", assistantMessage: "", expiresAt: "2099-01-01T00:00:00.000Z",
  candidate: null, current: null, latestAttemptId: "focused-review", stale: false,
  canAccept: false, acceptanceError: null, progress: null, failed: null,
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: e2eGuiMe });
    if (path.startsWith("/api/notifications")) return route.fulfill({ json: { notifications: [], unreadCount: 0 } });
    return route.fulfill({ status: 404, json: { error: "not_found" } });
  });
});

test("shows the stored structured difference without presenting incomplete work as acceptable", async ({ page }) => {
  await page.route("**/api/character-drafts/focused-review", (route) => route.fulfill({ json: {
    ...base, status: "awaiting_owner_acceptance", semanticCandidateReview: {
      schemaVersion: 3, fields: [{ key: "appearance", label: "外見", source: "赤い外套", candidate: "青い外套" }],
      limitation: "意味・公開範囲の検証と最終採用の接続は未完了です。",
    },
  } }));
  await page.goto("/reviews/focused-review");
  await expect(page.getByRole("heading", { name: "保存済みの構造化候補（V3）" })).toBeVisible();
  await page.getByText("外見（変更あり）", { exact: true }).click();
  await expect(page.getByText("赤い外套", { exact: true })).toBeVisible();
  await expect(page.getByText("青い外套", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "確定して保存" })).toHaveCount(0);
});

test("keeps the same owner command after an ambiguous response and opens the new attempt", async ({ page }) => {
  await page.route("**/api/character-drafts/*", (route) => {
    const next = route.request().url().endsWith("/focused-next");
    return route.fulfill({ json: { ...base, attemptId: next ? "focused-next" : base.attemptId,
      latestAttemptId: next ? "focused-next" : base.attemptId,
      sourceRetryAvailable: !next,
      failed: { attemptId: base.attemptId, characterId: base.characterId, kind: "create",
        errorCode: "technical_failure", updatedAt: "2026-09-14T00:00:00.000Z" },
    } });
  });
  const commands: string[] = [];
  await page.route("**/api/authoring/attempts/focused-review/retries", (route) => {
    const command = route.request().postDataJSON();
    commands.push(command.commandId);
    return commands.length === 1 ? route.abort("failed") : route.fulfill({ status: 202, json: {
      attemptId: "focused-next", characterId: base.characterId, kind: "create", progress: null,
      predecessorAttemptId: base.attemptId,
    } });
  });
  await page.goto("/reviews/focused-review");
  const retry = page.getByRole("button", { name: "元情報から再試行" });
  await retry.click();
  await expect(retry).toBeEnabled();
  await retry.click();
  await expect(page).toHaveURL(/\/reviews\/focused-next$/);
  expect(commands).toHaveLength(2);
  expect(commands[1]).toBe(commands[0]);
});
