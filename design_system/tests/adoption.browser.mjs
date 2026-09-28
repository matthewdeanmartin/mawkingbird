import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const story =
  "/iframe.html?id=adoption-sprint-3-toolbars--app-controls&viewMode=story";

test("production feed controls preserve actions, reversible preferences and native destinations", async ({
  page,
}) => {
  await page.goto(story);
  const actions = page.getByRole("toolbar", {
    name: "Feed actions",
    exact: true,
  });
  await actions.getByRole("button", { name: "Analytics" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "View: analytics · Refreshes: 0",
  );
  await actions.getByRole("button", { name: "Analytics" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "View: feed · Refreshes: 0",
  );
  await actions.getByRole("button", { name: "More" }).click();
  await expect(page.getByRole("status")).toHaveText(
    "View: feed · Refreshes: 1",
  );
  const presentation = page.getByRole("toolbar", { name: "Feed presentation" });
  const reader = presentation.getByRole("button", {
    name: "Reader",
    exact: false,
  });
  const textFocus = presentation.getByRole("button", { name: "Text-focus" });
  await reader.click();
  await expect(reader).toHaveAttribute("aria-pressed", "true");
  await expect(textFocus).toHaveAttribute("aria-pressed", "true");
  await textFocus.click();
  await expect(reader).toHaveAttribute("aria-pressed", "false");
  await expect(textFocus).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("link", { name: "Feed Doctor" })).toHaveAttribute(
    "href",
    new URL("/feed-doctor", page.url()).href,
  );
  const sources = page.getByRole("toolbar", { name: "Feed sources" });
  const rss = sources.getByRole("button", { name: "RSS" });
  await rss.click();
  await expect(rss).toHaveAttribute("aria-pressed", "false");
});

test("production reader toolbar leaves selects in the native Tab order", async ({
  page,
}) => {
  await page.goto(story);
  const size = page.getByRole("toolbar", { name: "Reader text size" });
  const smaller = size.getByRole("button", { name: "A−", exact: true });
  const larger = size.getByRole("button", { name: "A+", exact: true });
  await smaller.focus();
  await page.keyboard.press("ArrowRight");
  await expect(larger).toBeFocused();
  await page.keyboard.press("Space");
  await expect(size).toContainText("19px");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("combobox", { name: "Font family" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("combobox", { name: "Article theme" }),
  ).toBeFocused();
  await page
    .getByRole("combobox", { name: "Article theme" })
    .selectOption("sepia");
  await expect(
    page.getByRole("combobox", { name: "Article theme" }),
  ).toHaveValue("sepia");
  for (const toolbar of await page.getByRole("toolbar").all()) {
    await expect(toolbar.locator('button[tabindex="0"]')).toHaveCount(1);
    await expect(toolbar.locator("a, select, .btn")).toHaveCount(0);
  }
});

for (const [theme, width, direction] of [
  ["light", 1280, "ltr"],
  ["dark", 380, "ltr"],
  ["light", 380, "rtl"],
]) {
  test(`production toolbar layout ${theme} ${width} ${direction}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${story}&globals=theme:${theme};direction:${direction}`);
    await expect(
      page.getByRole("heading", { name: "Toolbars in the app" }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("app-toolbars.png"),
      fullPage: true,
    });
  });
}
