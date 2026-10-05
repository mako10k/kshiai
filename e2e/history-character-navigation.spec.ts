/** R: Verify visible battle-bound character navigation when legacy battle execution is unavailable. */
import { expect, test } from "@playwright/test";
import type { BattleListItem } from "@kshiai/shared";
import { e2eGuiMe } from "./fixtures/battle";

test.use({ launchOptions: { executablePath: process.env.E2E_CHROMIUM_EXECUTABLE } });

const legacy: BattleListItem = {
  id: "legacy-battle", status: "finished", turn: 12, turnLimit: 12,
  sideAName: "旧カナデ", sideBName: "旧レン",
  sideACharacterId: "old-kanade", sideBCharacterId: "old-ren",
  sideAImageUrl: null, sideBImageUrl: null, scene: "放課後の学校",
  winnerSide: null, createdAt: "2026-09-06T10:55:11Z", updatedAt: "2026-09-06T21:26:00Z",
  canResume: false, integrityStatus: "degraded", integrityMessage: "旧対戦の進行は利用できません。",
};

test("opens the immutable profile through visible character names despite absent portraits and a degraded battle", async ({ page }) => {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/api/me") return route.fulfill({ json: e2eGuiMe });
    if (path === "/api/battles") return route.fulfill({ json: { battles: [legacy], total: 1 } });
    if (path.startsWith("/api/notifications")) return route.fulfill({ json: { notifications: [], unreadCount: 0 } });
    return route.fulfill({ status: 404, json: { error: "not_found" } });
  });
  await page.goto("/history");
  const kanade = page.getByRole("link", { name: "旧カナデ の当時の詳細", exact: true });
  const ren = page.getByRole("link", { name: "旧レン の当時の詳細", exact: true });
  await expect(kanade).toBeVisible();
  await expect(ren).toBeVisible();
  await expect(kanade).toHaveCSS("text-decoration-line", "underline");
  await expect(kanade).toHaveAttribute("href", "/characters/old-kanade?battleId=legacy-battle");
  await expect(ren).toHaveAttribute("href", "/characters/old-ren?battleId=legacy-battle");
  await expect(page.getByRole("button", { name: /管理者による記録確認/ })).toBeDisabled();
  const profileRead = page.waitForRequest((r) => new URL(r.url()).pathname === "/api/characters/old-kanade"
    && new URL(r.url()).searchParams.get("battleId") === legacy.id);
  await kanade.click();
  await profileRead;
  await expect(page).toHaveURL(/\/characters\/old-kanade\?battleId=legacy-battle$/);
});
