import { test, expect } from "../../base.js";
import { login } from "../../helpers.js";
import { MockServer } from "../../mockServer.js";

test.describe("Sidebar tools", () => {
  let mockServer;

  test.beforeEach(async ({ page }) => {
    mockServer = new MockServer();
    await mockServer.setup(page);
    await login(page);
  });

  test("should show tools in the compact desktop sidebar and toggle laser", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1100, height: 1000 });
    await page.goto("/");
    await expect(page.locator("#home-view")).toBeVisible({ timeout: 10000 });

    const tools = page.locator('[data-testid="sidebar-tools"]');
    const laser = page.locator('[data-testid="window-tool-laser"]');
    const basketballize = page.locator(
      '[data-testid="window-tool-basketballize"]',
    );

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
