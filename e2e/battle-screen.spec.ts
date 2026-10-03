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
  test("renders all arrived speech immediately without fade or delayed reveal", async ({ page }) => {
    await mockParticipantApis(page);
    await page.unroute(`**/api/battles/${e2eGuiBattleId}`);
    await page.route(`**/api/battles/${e2eGuiBattleId}`, async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
        ...e2eGuiBattle,
        battle: { ...e2eGuiBattle.battle, log: [{ turn: 0, narrator: ["開幕。"], speeches: [
          { speaker: "ナギ", text: "最初の言葉。" },
          { speaker: "ガク", text: "すぐに返す言葉。" },
        ] }] },
      }) });
    });
    let releaseFollow = () => {};
    const followReady = new Promise<void>((resolve) => { releaseFollow = resolve; });
    await page.route(`**/api/battles/${e2eGuiBattleId}/narration/follow**`, async (route) => {
      await followReady;
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: `data: ${JSON.stringify({
        type: "reset", eventId: "event-1", cursor: "cursor-1",
        snapshot: { ...e2eGuiNarration, cursor: "cursor-1", entries: [{
          turnReceiptId: "receipt-1", sequence: 1, phase: "combat", combatTurn: 1, status: "completed",
          narrative: { turn: 1, narrator: ["次の場面。"], speeches: [
            { speaker: "ナギ", text: "新しく届いた言葉。" },
            { speaker: "ガク", text: "こちらも同時に表示。" },
          ] },
        }] },
      })}\n\n` });
    });
    await page.goto(`/battles/${e2eGuiBattleId}?resume=1`);
    const speech = page.locator(".log .speaker");
    await expect(speech).toHaveCount(2);
    await expect(speech.nth(0)).toContainText("最初の言葉。");
    await expect(speech.nth(1)).toContainText("すぐに返す言葉。");
    expect(await speech.evaluateAll((nodes) => nodes.map((node) => ({
      opacity: getComputedStyle(node).opacity,
      animation: getComputedStyle(node).animationName,
      activeAnimations: node.getAnimations().length,
    })))).toEqual([
      { opacity: "1", animation: "none", activeAnimations: 0 },
      { opacity: "1", animation: "none", activeAnimations: 0 },
    ]);
    releaseFollow();
    await expect(speech.nth(0)).toContainText("新しく届いた言葉。");
    await expect(speech.nth(1)).toContainText("こちらも同時に表示。");
    expect(await speech.evaluateAll((nodes) => nodes.map((node) => ({
      opacity: getComputedStyle(node).opacity,
      animation: getComputedStyle(node).animationName,
      activeAnimations: node.getAnimations().length,
    })))).toEqual([
      { opacity: "1", animation: "none", activeAnimations: 0 },
      { opacity: "1", animation: "none", activeAnimations: 0 },
    ]);
  });

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

  test("follows new story lines inside the log container", async ({ page }) => {
    const longBattle = structuredClone(e2eGuiBattle);
    longBattle.battle.log = Array.from({ length: 24 }, (_, turn) => ({
      turn,
      narrator: [`ターン${turn}の長い語り。石畳に雨が続き、路地の奥まで声が落ちる。`],
      speeches: [],
    }));
    await page.setViewportSize({ width: 390, height: 844 });
    await mockParticipantApis(page);
    await page.unroute(`**/api/battles/${e2eGuiBattleId}`);
    await page.route(`**/api/battles/${e2eGuiBattleId}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(longBattle),
      });
    });
    await page.goto(`/battles/${e2eGuiBattleId}?view=1`);

    const log = page.locator(".log");
    await expect(log).toBeVisible();
    await expect(page.getByText("ターン23の長い語り", { exact: false })).toBeAttached();
    await expect.poll(async () => {
      const position = await log.evaluate((node) => ({
        scrollTop: node.scrollTop,
        distanceFromEnd: node.scrollHeight - node.clientHeight - node.scrollTop,
        overflowing: node.scrollHeight > node.clientHeight,
      }));
      return position.overflowing && position.distanceFromEnd < 80
        ? position.scrollTop
        : 0;
    }).toBeGreaterThan(0);
  });
});
