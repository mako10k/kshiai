/** R: Verify browser affordances and requests for permitted character authoring and review. */
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

test("confirms a fixed V3 candidate with the exact reviewed digest and exposes its complete review", async ({ page }) => {
  const { createV3StageTrialCandidate } = await import("../backend/src/fixtures/neva-v3");
  const { characterDefinitionV3ToLegacySheet, toPublicCharacter } = await import("@kshiai/shared");
  const envelope = createV3StageTrialCandidate();
  const character = toPublicCharacter(characterDefinitionV3ToLegacySheet({
    characterId: "fixed-neva", ownerUserId: e2eGuiMe.user.id,
    definition: envelope.definition, publicPresentation: envelope.publicPresentation,
    createdAt: "2026-09-29T00:00:00.000Z", updatedAt: "2026-09-29T00:00:00.000Z",
  }), e2eGuiMe.user.id);
  const digest = "50edf23389df253762378ba622537cff3d86722f613693b6a92796a7624d307f";
  await page.route("**/api/character-drafts/focused-review", (route) => route.fulfill({ json: {
    ...base, status: "awaiting_owner_acceptance", candidate: character, canAccept: true,
    candidateDigest: digest, canEditCandidate: false,
    semanticCandidateReview: { schemaVersion: 3,
      fields: [{ key: "definition", label: "人物・能力・行動規範の全設定", source: null,
        candidate: JSON.stringify(envelope.definition) }],
      compatibility: { status: "ready", deferred: [], blocked: [] }, limitation: "固定入力の全設定を確定します。",
    },
  } }));
  await page.route("**/api/characters/focused-review/confirm", (route) => {
    expect(route.request().postDataJSON()).toEqual({ candidateDigest: digest });
    return route.fulfill({ json: { character } });
  });
  await page.goto("/reviews/focused-review");
  await expect(page.getByText("人物・能力・行動規範の全設定", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("例: もっと防御寄りに。髪色を暗い赤に。")).toHaveCount(0);
  const submitted = page.waitForRequest("**/api/characters/focused-review/confirm");
  await page.getByRole("button", { name: "確定して保存" }).click();
  await submitted;
  await expect(page).toHaveURL(/\/characters\/fixed-neva$/);
});

test("restricts closed owner review to confirmation and stays on the exact review after saving", async ({ page }) => {
  const { createV3StageTrialCandidate } = await import("../backend/src/fixtures/neva-v3");
  const { characterDefinitionV3ToLegacySheet, toPublicCharacter } = await import("@kshiai/shared");
  const envelope = createV3StageTrialCandidate();
  const character = toPublicCharacter(characterDefinitionV3ToLegacySheet({
    characterId: "fixed-neva", ownerUserId: e2eGuiMe.user.id,
    definition: envelope.definition, publicPresentation: envelope.publicPresentation,
    createdAt: "2026-09-29T00:00:00.000Z", updatedAt: "2026-09-29T00:00:00.000Z",
  }), e2eGuiMe.user.id);
  await page.route("**/api/me", (route) => route.fulfill({ json: { ...e2eGuiMe, reviewConfirmOnly: true } }));
  let confirmed = false;
  const digest = "50edf23389df253762378ba622537cff3d86722f613693b6a92796a7624d307f";
  await page.route("**/api/character-drafts/focused-review", (route) => route.fulfill({ json: {
    ...base, status: confirmed ? "accepted" : "awaiting_owner_acceptance", candidate: character, canAccept: !confirmed, reviewConfirmOnly: true,
    candidateDigest: digest, canEditCandidate: false,
    semanticCandidateReview: { schemaVersion: 3,
      fields: [{ key: "definition", label: "人物・能力・行動規範の全設定", source: null,
        candidate: JSON.stringify(envelope.definition) }],
      compatibility: { status: "ready", deferred: [], blocked: [] }, limitation: "固定入力の全設定を確定します。",
    },
  } }));
  await page.route("**/api/characters/focused-review/confirm", (route) => {
    confirmed = true;
    expect(route.request().postDataJSON()).toEqual({ candidateDigest: digest });
    return route.fulfill({ json: { character } });
  });
  await page.goto("/reviews/focused-review");
  await expect(page.getByText("人物・能力・行動規範の全設定", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("例: もっと防御寄りに。髪色を暗い赤に。")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "破棄", exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "主要ナビゲーション" })).toHaveCount(0);
  await expect(page.getByText("切替準備中は、この内容の確認と確定だけができます。")).toBeVisible();
  const submitted = page.waitForRequest("**/api/characters/focused-review/confirm");
  await page.getByRole("button", { name: "確定して保存" }).click();
  await submitted;
  await expect(page).toHaveURL(/\/reviews\/focused-review$/);
  await expect(page.getByRole("button", { name: "確定して保存" })).toHaveCount(0);
});

test("keeps an owned V2 profile readable without advertising unavailable migration or ordinary editors", async ({ page }) => {
  const { createV3StageTrialCandidate } = await import("../backend/src/fixtures/neva-v3");
  const { characterDefinitionV3ToLegacySheet, toPublicCharacter } = await import("@kshiai/shared");
  const envelope = createV3StageTrialCandidate();
  const character = { ...toPublicCharacter(characterDefinitionV3ToLegacySheet({
    characterId: "read-only-character", ownerUserId: e2eGuiMe.user.id,
    definition: envelope.definition, publicPresentation: envelope.publicPresentation,
    createdAt: "2026-09-14T00:00:00Z", updatedAt: "2026-09-14T00:00:00Z",
  }), e2eGuiMe.user.id), compatibility: { status: "ready", schemaVersion: 2, currentGenerationId: "old-generation", reasonCode: null },
    selectable: false, upgradeAction: null };
  await page.route("**/api/characters/read-only-character", (route) => route.fulfill({ json: { character, isOwner: true } }));
  await page.goto("/characters/read-only-character");
  await expect(page.getByText("現在、自動でV3へ移行する機能は利用できません。この旧版は閲覧できます。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "このキャラをV3へ移行" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "改善提案（戦績コーチ）" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "削除", exact: true })).toHaveCount(0);
});
