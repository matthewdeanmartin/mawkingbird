import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const url = "https://example.com/" + "a".repeat(4096);
const label = "example.com/" + "a".repeat(19) + "…";
for (const width of [390, 1280]) {
  test(`post and plain-text URLs stay compact at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(
      "/iframe.html?id=start-here-sprint-11-review--long-links&viewMode=story",
    );
    for (const selector of [".content a", ".long-text a"]) {
      const link = page.locator(selector).filter({ hasText: label }).first();
      await expect(link).toHaveText(label);
      await expect(link).toHaveAttribute("href", url);
      const bounds = await link.boundingBox();
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    }
    expect(
      await page
        .locator(".long-text app-linked-text")
        .evaluate((el) => getComputedStyle(el).whiteSpace),
    ).toBe("nowrap");
    await page.route(url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<p>Full destination reached</p>",
      }),
    );
    await page.locator(".long-text a").click();
    await expect(page).toHaveURL(url);
    await expect(page.getByText("Full destination reached")).toBeVisible();
  });
  test(`Inbox URL labels stay compact at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(
      "/iframe.html?id=adoption-notification-layout--compact-actions&viewMode=story",
    );
    const links = page.locator(".excerpt-content a");
    // Conversations shows the mention, Stats groups the reactions by post,
    // and Stream shows each notification. The old digest toggle was retired.
    for (const [view, count] of [["Conversations", 1], ["Stats", 1], ["Stream", 4]]) {
      await page.getByRole("navigation", { name: "Inbox views" }).getByRole("link", { name: view, exact: true }).click();
      await expect(links).toHaveCount(count);
      for (const link of await links.all()) {
        await expect(link).toHaveText(label);
        await expect(link).toHaveAttribute("href", url);
        const bounds = await link.boundingBox();
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      }
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.route(url, (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<p>Full destination reached</p>",
      }),
    );
    await links.first().click();
    await expect(page).toHaveURL(url);
  });
}
