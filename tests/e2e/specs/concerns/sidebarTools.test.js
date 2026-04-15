import { test, expect } from "../../base.js";
import { login } from "../../helpers.js";
import { MockServer } from "../../mockServer.js";

async function expectCentered(page) {
  const center = await page
    .locator('[data-testid="view-column-center"]')
    .boundingBox();
  expect(center).not.toBeNull();

  const rightEdge = center.x + center.width;
  const leftMargin = center.x;
  const rightMargin = page.viewportSize().width - rightEdge;

  // Chromium includes the vertical scrollbar in the viewport width, so allow
  // for that small desktop offset while still catching real shell drift.
  expect(Math.abs(leftMargin - rightMargin)).toBeLessThanOrEqual(20);
}

test.describe("Sidebar tools", () => {
  let mockServer;

  test.beforeEach(async ({ page }) => {
    mockServer = new MockServer();
    await mockServer.setup(page);
    await login(page);
  });

  test("should keep tools hidden in the compact desktop sidebar", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1100, height: 1000 });
    await page.goto("/");
    await expect(page.locator("#home-view")).toBeVisible({ timeout: 10000 });
    await expectCentered(page);

    await expect(page.locator('[data-testid="sidebar-tools"]')).toBeHidden();
    await expect(
      page.locator('[data-testid="sidebar-compose-button"]'),
    ).toBeHidden();
  });

  test("should show tools in the full desktop sidebar and toggle laser", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1400, height: 1000 });
    await page.goto("/");
    await expect(page.locator("#home-view")).toBeVisible({ timeout: 10000 });
    await expectCentered(page);

    const tools = page.locator('[data-testid="sidebar-tools"]');
    const laser = page.locator('[data-testid="window-tool-laser"]');
    const basketballize = page.locator(
      '[data-testid="window-tool-basketballize"]',
    );

    await expect(
      page.locator('[data-testid="sidebar-compose-button"]'),
    ).toBeVisible();
    await expect(tools).toBeVisible();
    await expect(laser).toBeVisible();
    await expect(basketballize).toBeVisible();

    await laser.click();
    await expect(laser).toHaveClass(/selected/);
    await expect(basketballize).not.toHaveClass(/selected/);

    await laser.click();
    await expect(laser).not.toHaveClass(/selected/);
  });

  test("should show tools in the mobile sidebar drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator("#home-view")).toBeVisible({ timeout: 10000 });

    await page.locator(".menu-button").click();

    await expect(page.locator('[data-testid="sidebar-tools"]')).toBeVisible();
    await expect(
      page.locator('[data-testid="window-tool-laser"]'),
    ).toBeVisible();
    await expect(
      page.locator('[data-testid="window-tool-basketballize"]'),
    ).toBeVisible();
  });
});
