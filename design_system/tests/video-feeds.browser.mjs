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
    const sort = page.getByLabel("Sort videos", { exact: true });
    // The compact feed select, as on Home and RSS.
    await expect(sort).toHaveCSS("appearance", "none");
    await expect(page.locator(".youtube-preview").first()).toHaveCSS(
      "border-radius",
      "8px",
    );
    // One toolbar: which videos (pressed), then the page's actions.
    const toolbar = feed.getByRole("toolbar", { name: "Subscriptions feed" });
    await expect(toolbar.getByRole("button")).toHaveText([
      "All videos",
      "Saved videos",
      "Shorts",
      "",
      "",
    ]);
    for (const name of ["Refresh", "Customize"])
      await expect(toolbar.getByRole("button", { name })).toBeVisible();
    await expect(
      toolbar.getByRole("button", { name: "All videos" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      toolbar.getByRole("button", { name: "Shorts" }),
    ).toHaveAttribute("aria-pressed", "false");
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
    // Phone width: the channels fold away until asked for, so the feed comes first.
    const channels = page.getByRole("button", { name: "Channels (1)" });
    await expect(channels).toHaveAttribute("aria-expanded", "false");
    const box = page.getByLabel(/YouTube channel link/);
    await expect(box).toBeHidden();
    await channels.click();
    await expect(box).toBeVisible();
    await channels.click();
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
    await feed.getByRole("button", { name: "All videos", exact: true }).click();
    await expect(feed.locator(".video-post")).toHaveCount(2);
    await card
      .getByRole("button", { name: "Post Response", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.setViewportSize({ width: 1280, height: 900 });
    expect((await dialog.boundingBox()).width).toBeGreaterThan(700);
    await page.setViewportSize({ width: 390, height: 844 });
    expect((await dialog.boundingBox()).width).toBeLessThanOrEqual(390);
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
