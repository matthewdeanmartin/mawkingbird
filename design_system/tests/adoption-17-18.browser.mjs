import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const url =
  "/iframe.html?id=start-here-sprints-17-and-18-review--local-panels-and-metadata&viewMode=story";
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
    page.getByRole("heading", {
      name: "Final batch: local panels and readable identities.",
    }),
  ).toBeVisible();
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
test("local tab keys move focus before activation, retain native profile links and do not refetch", async ({
  page,
}) => {
  const posts = page.getByRole("tab", { name: "Posts", exact: true });
  const members = page.getByRole("tab", { name: "Members", exact: true });
  await posts.focus();
  await page.keyboard.press("ArrowRight");
  await expect(members).toBeFocused();
  await expect(posts).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Enter");
  await expect(members).toHaveAttribute("aria-selected", "true");
  const panel = page.getByRole("tabpanel", { name: "Members", exact: true });
  await expect(panel).toBeVisible();
  const link = panel.getByRole("link").first();
  await expect(link).toHaveAttribute(
    "href",
    new URL("/accounts/reader-one", page.url()).href,
  );
  await expect(link).toContainText(
    "@a-long-account-handle@a-very-long-community-domain.example",
  );
  await page.keyboard.press("Home");
  await page.keyboard.press("Space");
  await expect(posts).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("tabpanel", { name: "Posts", exact: true }),
  ).toContainText("No posts from these accounts.");
  await expect(page.locator("[data-reads]")).toHaveText("Member reads: 1");
});
test("pending, empty and missing lists retain their meanings", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Loading", exact: true }).click();
  await page.getByRole("tab", { name: "Members", exact: true }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Members", exact: true }),
  ).toContainText("Loading");
  await page
    .getByRole("button", { name: "Finish loading", exact: true })
    .click();
  await expect(
    page
      .getByRole("tabpanel", { name: "Members", exact: true })
      .getByRole("link"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Empty list", exact: true }).click();
  await expect(
    page.getByRole("tabpanel", { name: "Posts", exact: true }),
  ).toContainText("No members yet");
  await page.getByRole("button", { name: "Missing list", exact: true }).click();
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Back to feeds" }),
  ).toHaveAttribute("href", new URL("/feeds", page.url()).href);
});
test("history preserves version content and native timestamps, then returns focus", async ({
  page,
}) => {
  const trigger = page.getByRole("button", {
    name: "Edit history",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: "Edit history",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("mb-metadata")).toHaveCount(2);
  await expect(dialog.locator("time").last()).toHaveAttribute(
    "datetime",
    "2026-09-28T13:45:00Z",
  );
  await expect(dialog).toContainText("Current");
  await expect(dialog).toContainText("An earlier version");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});
for (const [width, theme, direction] of [
  [1280, "light", "ltr"],
  [375, "dark", "ltr"],
  [320, "light", "rtl"],
])
  test(`final batch ${width} ${theme} ${direction}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${url}&globals=theme:${theme};direction:${direction}`);
    const posts = page.getByRole("tab", { name: "Posts", exact: true });
    await posts.focus();
    await page.keyboard.press(direction === "rtl" ? "ArrowLeft" : "ArrowRight");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("tab", { name: "Members", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("members.png"),
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Edit history", exact: true })
      .click();
    await page
      .getByRole("dialog", { name: "Edit history", exact: true })
      .screenshot({ path: info.outputPath("history.png") });
  });
