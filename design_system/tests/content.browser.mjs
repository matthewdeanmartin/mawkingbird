import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const review =
  "/iframe.html?id=start-here-sprint-5-review--review&viewMode=story";
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const messages = [];
  errors.set(page, messages);
  page.on("pageerror", (e) => messages.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") messages.push(e.text());
  });
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

test("content actions preserve keyboard navigation, toggles and native links", async ({
  page,
}) => {
  await page.goto(review);
  const reply = page.getByRole("button", {
    name: "Reply, 3 replies",
    exact: true,
  });
  const favorite = page.getByRole("button", { name: "Favorite", exact: true });
  await reply.focus();
  await page.keyboard.press("ArrowRight");
  await expect(favorite).toBeFocused();
  await page.keyboard.press("Space");
  await expect(favorite).toHaveAttribute("aria-pressed", "true");
  await expect(favorite).toContainText("25");
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("button", { name: "Bookmark", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Bookmark", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Home");
  await expect(reply).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page
      .getByRole("article", { name: "Preview post", exact: true })
      .getByRole("status"),
  ).toContainText("Reply preview opened");
  await expect(
    page.getByRole("button", { name: "Boost unavailable in this preview" }),
  ).toBeDisabled();
  await expect(page.getByRole("link", { name: "Alex Rivera" })).toHaveAttribute(
    "href",
    "#account-preview",
  );
  await expect(
    page
      .getByRole("article", { name: "Preview post", exact: true })
      .locator("time"),
  ).toHaveAttribute("datetime", "2026-09-27T14:30:00Z");
});
test("retry preserves the post and announces recovery without reannouncing static states", async ({
  page,
}) => {
  await page.goto(review);
  const post = page.getByRole("article", { name: "Preview post" });
  const before = await post.textContent();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator("mb-content-state [role=status]")).toHaveText(
    /Connection restored/,
  );
  await expect(page.getByRole("button", { name: "Try again" })).toBeDisabled();
  expect(await post.textContent()).toBe(before);
});
for (const [theme, width, direction] of [
  ["light", 1280, "ltr"],
  ["dark", 380, "ltr"],
  ["light", 380, "rtl"],
]) {
  test(`content layout ${theme} ${width} ${direction}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(
      `/iframe.html?id=start-here-sprint-5-review--long-names&viewMode=story&globals=theme:${theme};direction:${direction}`,
    );
    await expect(
      page.getByRole("heading", { name: "Content that stays readable." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const toolbar = page.getByRole("toolbar", { name: "Post actions" });
    expect((await toolbar.boundingBox()).height).toBeLessThanOrEqual(60);
    await page.screenshot({
      path: info.outputPath("content.png"),
      fullPage: true,
    });
  });
}
test("touch action targets have space for fingers", async ({
  page,
  baseURL,
}) => {
  await page.emulateMedia({ media: "screen" });
  // Coarse-pointer emulation is supplied by a touch-enabled browser context below.
  const context = await page
    .context()
    .browser()
    .newContext({ hasTouch: true, viewport: { width: 380, height: 900 } });
  try {
    const touch = await context.newPage();
    await touch.goto(new URL(review, baseURL).href);
    for (const button of await touch.locator("mb-toolbar button").all()) {
      const box = await button.boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }
  } finally {
    await context.close();
  }
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
    test(`content text contrast ${theme}/${accent}`, async ({ page }) => {
      await page.goto(`${review}&globals=theme:${theme};accent:${accent}`);
      const ratios = await page
        .locator(
          "a[mbContentLink], mb-badge, mb-content-state strong, mb-content-state p, mb-metadata > span, mb-toolbar button",
        )
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
      expect(ratios.length).toBeGreaterThanOrEqual(15);
      for (const pair of ratios)
        expect(pair.ratio, JSON.stringify(pair)).toBeGreaterThanOrEqual(7);
    });
  }
}
