import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
for (const theme of ["light", "dark"]) {
  test(`video feed controls and response composer in ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("https://i.ytimg.com/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="270"><rect width="480" height="270" fill="#46535e"/></svg>',
      }),
    );
    await page.goto(
      `/iframe.html?id=start-here-video-feeds--subscriptions&viewMode=story&globals=theme:${theme}`,
    );
    const feed = page.locator(".video-feed");
    await expect(feed.locator("header button")).toHaveText([
      "Refresh",
      "Main feed",
      "Saved videos",
    ]);
    await page
      .getByRole("button", { name: "About video subscriptions", exact: true })
      .click();
    await expect(page.locator("[popover]:popover-open")).toContainText(
      "No YouTube account is needed.",
    );
    await page.keyboard.press("Escape");
    await feed.locator("header").scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("video-feed.png") });
    await page
      .getByLabel("Sort videos", { exact: true })
      .selectOption("oldest");
    const card = feed.locator(".video-post").first();
    await expect(card.locator("h3")).toHaveText("How lamps work");
    await expect(
      card.getByRole("link", { name: "Open on YouTube", exact: true }),
    ).toHaveCount(1);
    await expect(
      card.getByRole("link", { name: "Watch Party", exact: true }),
    ).toHaveAttribute("href", /watch\?youtube=0KoeY54M5VA/);
    await card
      .getByRole("button", { name: "Save for later", exact: true })
      .click();
    await feed
      .getByRole("button", { name: "Saved videos", exact: true })
      .click();
    await expect(feed.locator(".video-post")).toHaveCount(1);
    await feed.getByRole("button", { name: "Main feed", exact: true }).click();
    await expect(feed.locator(".video-post")).toHaveCount(2);
    await card
      .getByRole("button", { name: "Post Response", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const body = dialog.locator("textarea").first();
    await expect(body).toHaveValue(/How lamps work/);
    await expect(body).toHaveValue(/#TechnologyConnections/);
    await body.fill("My response: " + (await body.inputValue()));
    await expect(body).toHaveValue(/^My response:/);
    await expect(page.locator("iframe")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("video-response.png") });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
