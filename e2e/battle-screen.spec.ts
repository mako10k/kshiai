import { expect, test, type Page } from "@playwright/test";
import {
  e2eGuiBattle,
  e2eGuiBattleId,
  e2eGuiMe,
  e2eGuiNarration,
} from "./fixtures/battle";

async function mockParticipantApis(page: Page): Promise<void> {
  await page.route("**/api/me", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(e2eGuiMe),
    });
  });
  await page.route("**/api/notifications**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ notifications: [], unreadCount: 0 }),
    });
  });
  await page.route("**/api/battles/*/narration**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(e2eGuiNarration),
    });
  });
  await page.route(`**/api/battles/${e2eGuiBattleId}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(e2eGuiBattle),
    });
  });
}

test.describe("battle screen", () => {
  test("keeps the latest log above the bottom nav and hides save plus extra object facts", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await mockParticipantApis(page);
    await page.goto(`/battles/${e2eGuiBattleId}?view=1`);

    const accordion = page.locator("details.battle-field-state");
    await expect(page.getByRole("heading", { name: "バトル" })).toBeVisible();
    await expect(accordion).toBeVisible();
    await expect(accordion).not.toHaveAttribute("open");
    await expect(page.getByText("戦場を保存")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /戦場を保存/ })).toHaveCount(0);
    await expect(accordion.locator("summary")).toHaveText("戦場の物（1）");

    const marker = page.locator(".battle-log-end");
    const nav = page.locator("nav.bottom-nav");
    await marker.scrollIntoViewIfNeeded();
    const markerBox = await marker.boundingBox();
    const navBox = await nav.boundingBox();
    expect(markerBox).toBeTruthy();
    expect(navBox).toBeTruthy();
    expect(markerBox!.y + markerBox!.height).toBeLessThan(navBox!.y);

    const scrollMargin = await marker.evaluate((node) =>
      getComputedStyle(node).scrollMarginBottom,
    );
    expect(Number.parseFloat(scrollMargin)).toBeGreaterThan(60);
  });
});
