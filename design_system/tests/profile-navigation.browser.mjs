import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");

for (const platform of [
  "mastodon",
  "bluesky",
  "misskey",
  "rss",
  "twitter",
  "self",
  "openrouter",
]) {
  for (const width of [390, 933]) {
    test(`${platform} Back stays beside profile actions at ${width}px`, async ({
      page,
    }, testInfo) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width, height: 850 });
      await page.goto(
        `/iframe.html?id=navigation-profile-back--${platform}&viewMode=story`,
      );
      const profile = page.locator("app-profile");
      const back = profile.getByRole("button", { name: "Back", exact: true });
      await expect(back).toBeVisible();
      await expect(
        profile.locator(".profile-buttons > app-reading-back:first-child"),
      ).toHaveCount(1);
      await expect(
        profile.locator(".profile-tabs app-reading-back"),
      ).toHaveCount(0);
      const bounds = await page.evaluate(() => {
        const box = (selector) =>
          document.querySelector(selector).getBoundingClientRect();
        const nav = box('nav[aria-label="App navigation"]');
        const banner = box(".header-banner");
        const actions = box(".profile-buttons");
        return {
          gap: banner.top - nav.bottom,
          actionsBelowBanner: actions.top >= banner.bottom,
          overflow: document.documentElement.scrollWidth > innerWidth,
        };
      });
      expect(Math.abs(bounds.gap)).toBeLessThan(1);
      expect(bounds.actionsBelowBanner).toBe(true);
      expect(bounds.overflow).toBe(false);
      expect(errors).toEqual([]);
      if (platform === "mastodon") {
        await expect(
          profile.getByRole("button", { name: "Reply", exact: true }),
        ).toBeVisible();
        await page.screenshot({
          path: testInfo.outputPath("profile-back.png"),
          fullPage: true,
        });
      }
    });
  }
}
