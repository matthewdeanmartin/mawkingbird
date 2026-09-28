import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const url =
  "/iframe.html?id=start-here-sprint-16-review--feed-actions-and-polls&viewMode=story";
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const messages = [];
  errors.set(page, messages);
  page.on("pageerror", (e) => messages.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") messages.push(e.text());
  });
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Feed actions and poll disclosure." }),
  ).toBeVisible();
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
const feedLink = (page) =>
  page.getByRole("link", { name: "View feed", exact: true });
const unsubscribe = (page) =>
  page
    .getByRole("region", { name: "Feed controls" })
    .locator("mb-post-actions")
    .getByRole("button", { name: "Unsubscribe", exact: true });
test("feed navigation is one direct native link with no popup", async ({
  page,
}) => {
  await expect(feedLink(page)).toBeVisible();
  expect(
    decodeURIComponent(await feedLink(page).getAttribute("href")),
  ).toContain("rss:https://example.test/feed?topic=long-form&lang=en");
  await expect(page.locator("app-rss-feed-actions [popover]")).toHaveCount(0);
  await feedLink(page).focus();
  await page.keyboard.press("Tab");
  await expect(unsubscribe(page)).toBeFocused();
  await expect(page.locator("[data-subscription]")).toHaveText("Subscribed");
});
test("unsubscribe cancels safely, then confirms the exact feed once and restores focus", async ({
  page,
}) => {
  const storage = await page.evaluate(() =>
    JSON.stringify({ ...localStorage }),
  );
  await unsubscribe(page).click();
  const confirmation = page.getByRole("alertdialog", {
    name: /^Unsubscribe from/,
  });
  await expect(confirmation).toBeVisible();
  await expect(page.locator("[data-removed]")).toBeEmpty();
  await confirmation
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(confirmation).toBeHidden();
  await expect(unsubscribe(page)).toBeFocused();
  await expect(page.locator("[data-subscription]")).toHaveText("Subscribed");
  await unsubscribe(page).click();
  await confirmation
    .getByRole("button", { name: "Unsubscribe", exact: true })
    .click();
  await expect(page.locator("[data-removed]")).toHaveText(
    "https://example.test/feed?topic=long-form&lang=en",
  );
  await expect(page.locator("[data-emitted]")).toHaveText(
    "https://example.test/feed?topic=long-form&lang=en",
  );
  await expect(feedLink(page)).toBeFocused();
  await expect(unsubscribe(page)).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe(
    storage,
  );
});
test("statistics open with the keyboard, update counts and respect hidden results", async ({
  page,
}) => {
  const poll = page.getByRole("region", { name: "Poll results" });
  const summary = poll.locator("summary");
  await expect(
    poll.getByText("Sample: 2000 voters", { exact: true }),
  ).toBeHidden();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(
    poll.getByText("Sample: 2000 voters", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Multiple choice", exact: true })
    .click();
  await expect(
    poll.getByText("Sample: 1500 voters", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Missing counts", exact: true })
    .click();
  await expect(
    poll.getByText(
      "Statistics need complete option counts and a nonzero voter count.",
      { exact: true },
    ),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Hidden results", exact: true })
    .click();
  await expect(summary).toHaveCount(0);
  await expect(poll.locator(".poll-bar, .error-range")).toHaveCount(0);
  await expect(
    poll.getByText(
      "Results are available after voting or when the poll closes.",
    ),
  ).toBeVisible();
});
for (const [width, theme, direction] of [
  [1280, "light", "ltr"],
  [375, "dark", "ltr"],
  [320, "light", "rtl"],
]) {
  test(`post details ${width} ${theme} ${direction}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${url}&globals=theme:${theme};direction:${direction}`);
    await page.locator("summary").click();
    await expect(feedLink(page)).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath("popup.png") });
    await page.screenshot({
      path: info.outputPath("post-details.png"),
      fullPage: true,
    });
  });
}
