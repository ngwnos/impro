import { test, expect } from "../../base.js";
import { login } from "../../helpers.js";
import { MockServer } from "../../mockServer.js";

async function expectLegacyDesktopLayout(page) {
  const layout = await page.evaluate(() => {
    const center = document
      .querySelector('[data-testid="view-column-center"]')
      .getBoundingClientRect();

    return {
      width: center.width,
      x: center.x,
      documentWidth: document.body.getBoundingClientRect().width,
    };
  });

  expect(layout.width).toBe(600);
  expect(layout.x).toBe((layout.documentWidth - layout.width) / 2);
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
    await expectLegacyDesktopLayout(page);

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
    await expectLegacyDesktopLayout(page);

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
