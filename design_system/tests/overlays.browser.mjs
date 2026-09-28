import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const review =
  "/iframe.html?id=start-here-sprint-4-review--review&viewMode=story";
const runtimeErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  runtimeErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(runtimeErrors.get(page)).toEqual([]);
});

for (const theme of ["light", "dark"]) {
  for (const accent of [
    "blue",
    "yellow",
    "rose",
    "purple",
    "orange",
    "green",
  ]) {
    test(`overlay text contrast ${theme}/${accent}`, async ({ page }) => {
      await page.goto(`${review}&globals=theme:${theme};accent:${accent}`);
      await page
        .getByRole("button", { name: "Feed actions", exact: true })
        .click();
      const ratios = await page
        .locator('[role="menu"] button')
        .evaluateAll((items) => {
          const luminance = (color) =>
            color
              .match(/[\d.]+/g)
              .slice(0, 3)
              .map(Number)
              .map((n) => n / 255)
              .map((n) =>
                n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4,
              )
              .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
          return items.map((item) => {
            let surface = item;
            while (
              getComputedStyle(surface).backgroundColor ===
                "rgba(0, 0, 0, 0)" &&
              surface.parentElement
            )
              surface = surface.parentElement;
            const fg = luminance(getComputedStyle(item).color);
            const bg = luminance(getComputedStyle(surface).backgroundColor);
            return {
              text: item.textContent.trim(),
              ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
            };
          });
        });
      expect(ratios).toHaveLength(4);
      for (const pair of ratios)
        expect(pair.ratio, JSON.stringify(pair)).toBeGreaterThanOrEqual(7);
    });
  }
}

test("Sprint 4 opens in the Storybook manager", async ({ page }) => {
  await page.goto("/?path=/story/start-here-sprint-4-review--review");
  await expect(
    page
      .frameLocator("#storybook-preview-iframe")
      .getByRole("heading", { name: "Overlays with a clear way back." }),
  ).toBeVisible();
});

test("modal focus, nested Escape, scroll locking and return focus", async ({
  page,
}) => {
  await page.goto(review);
  const trigger = page.getByRole("button", {
    name: "Edit feed details",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: "Edit feed details",
    exact: true,
  });
  const close = dialog.getByRole("button", { name: "Close", exact: true });
  await expect(close).toBeFocused();
  await expect(page.locator("html")).toHaveCSS("overflow", "hidden");
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("button", { name: "Save changes" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.mouse.click(5, 5);
  await expect(dialog).toBeVisible();
  const nestedTrigger = dialog.getByRole("button", { name: "Review removal" });
  await nestedTrigger.click();
  const nested = page.getByRole("dialog", {
    name: "Remove this feed?",
    exact: true,
  });
  await expect(nested.getByRole("button", { name: "Keep feed" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(nested).toHaveCount(0);
  await expect(dialog).toBeVisible();
  await expect(nestedTrigger).toBeFocused();
  await expect(page.locator("html")).toHaveCSS("overflow", "hidden");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.locator("html")).not.toHaveCSS("overflow", "hidden");
});

test("save failure preserves edits and busy dismissal is blocked until retry", async ({
  page,
}) => {
  await page.goto(review);
  await page
    .getByRole("button", { name: "Edit feed details", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Edit feed details",
    exact: true,
  });
  await dialog.getByRole("textbox", { name: "Feed name" }).fill("Edited feed");
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("alert")).toContainText("connection failed");
  await expect(dialog.getByRole("textbox", { name: "Feed name" })).toHaveValue(
    "Edited feed",
  );
  await dialog.getByRole("button", { name: "Save changes" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("Saved: Edited feed");
  await expect(
    page.getByRole("button", { name: "Edit feed details", exact: true }),
  ).toBeFocused();
});

test("menu skips disabled actions, supports typeahead, Escape and Tab", async ({
  page,
}) => {
  await page.goto(review);
  const trigger = page.getByRole("button", {
    name: "Feed actions",
    exact: true,
  });
  await trigger.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Rename feed" }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Refresh feed" }),
  ).toBeFocused();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("menuitem", { name: "Remove feed…" }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("r");
  await expect(
    page.getByRole("menuitem", { name: "Refresh feed" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Selected: refresh");
  await expect(trigger).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(
    page.getByRole("menuitem", { name: "Remove feed…" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Next control" }),
  ).toBeFocused();
  await expect(page.getByRole("menu")).not.toBeVisible();
});

test("popover light dismissal and Escape inside a modal affect only the popup", async ({
  page,
}) => {
  await page.goto(review);
  await page.getByRole("button", { name: "Reading options" }).click();
  await expect(
    page.getByRole("combobox", { name: "Reading width" }),
  ).toBeFocused();
  await page
    .getByRole("heading", { name: "Overlays with a clear way back." })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Reading options" }),
  ).not.toBeVisible();
  await page
    .getByRole("button", { name: "Edit feed details", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Edit feed details",
    exact: true,
  });
  await dialog.getByRole("button", { name: "About this feed" }).click();
  await expect(
    page.getByRole("dialog", { name: "About this feed", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "About this feed", exact: true }),
  ).not.toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "About this feed" }),
  ).toBeFocused();
});

test("backdrop dismissal is opt in, and clicks inside the dialog do not dismiss", async ({
  page,
}) => {
  await page.goto(
    "/iframe.html?id=start-here-sprint-4-review--backdrop-dismissal&viewMode=story",
  );
  await page
    .getByRole("button", { name: "Edit feed details", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Edit feed details",
    exact: true,
  });
  const box = await dialog.boundingBox();
  await page.mouse.click(box.x + 4, box.y + 4);
  await expect(dialog).toBeVisible();
  await page.mouse.click(5, 5);
  await expect(dialog).toHaveCount(0);
});

test("disclosure retains native keyboard behavior", async ({ page }) => {
  await page.goto(review);
  const summary = page.locator("mb-disclosure summary");
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("link", { name: "Read the notice below" }),
  ).toBeVisible();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("link", { name: "Read the notice below" }),
  ).not.toBeVisible();
});

for (const [theme, width, direction] of [
  ["light", 1280, "ltr"],
  ["dark", 380, "ltr"],
  ["light", 380, "rtl"],
]) {
  test(`overlay layouts ${theme} ${width} ${direction}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 800 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`${review}&globals=theme:${theme};direction:${direction}`);
    await page
      .getByRole("button", { name: "Feed actions", exact: true })
      .click();
    const menu = await page.getByRole("menu").boundingBox();
    expect(menu.x).toBeGreaterThanOrEqual(0);
    expect(menu.x + menu.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      // Capture the actual viewport: full-page capture temporarily resizes Chromium,
      // which intentionally dismisses an anchored popup.
      path: testInfo.outputPath("menu.png"),
      fullPage: false,
    });
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await page
      .getByRole("button", { name: "Edit feed details", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Edit feed details", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("dialog.png"),
      fullPage: true,
    });
  });
}

test("long dialog scrolls internally in a small viewport", async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 480 });
  await page.goto(
    "/iframe.html?id=start-here-sprint-4-review--long-dialog&viewMode=story",
  );
  await page
    .getByRole("button", { name: "Edit feed details", exact: true })
    .click();
  const dialog = page.locator("dialog[open]");
  expect((await dialog.boundingBox()).height).toBeLessThanOrEqual(448);
  await dialog.getByRole("button", { name: "Save changes" }).focus();
  expect(await dialog.evaluate((element) => element.scrollTop)).toBeGreaterThan(
    0,
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
