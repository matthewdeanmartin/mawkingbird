import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const messages = [];
  errors.set(page, messages);
  page.on("pageerror", (error) => messages.push(error.message));
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

test.describe("touch and RTL", () => {
  test.use({ hasTouch: true });
  test("dark compact tools retain touch targets and fit a narrow RTL column", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 1000 });
    await page.goto(
      "/iframe.html?id=adoption-composer--compact&viewMode=story&globals=theme:dark;accent:purple;direction:rtl",
    );
    const composer = page.locator("app-compose");
    await expect(composer.locator("textarea").first()).toBeVisible();
    const bounds = await composer.locator(".compose").boundingBox();
    for (const button of await composer
      .locator(".compose-tools button")
      .all()) {
      if (!(await button.isVisible())) continue;
      const box = await button.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(bounds.x);
      expect(box.x + box.width).toBeLessThanOrEqual(
        bounds.x + bounds.width + 1,
      );
    }
    await composer.getByRole("button", { name: "Insert emoji" }).click();
    await expect(composer.locator("em-emoji-picker")).toBeVisible();
    await composer
      .locator("em-emoji-picker")
      .getByRole("button", { name: "😀", exact: true })
      .first()
      .click();
    await expect(composer.locator("textarea").first()).toHaveValue(/😀/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
});

for (const mode of ["compact", "full", "chat"]) {
  for (const width of [320, 480, 1100]) {
    test(mode + " all-tools layout at " + width, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(
        "/iframe.html?id=adoption-composer--" + mode + "&viewMode=story",
      );
      const composer = page.locator("app-compose");
      await expect(composer.locator("textarea").first()).toBeVisible();
      if (mode === "chat" && width <= 800) {
        await composer
          .getByRole("button", { name: "More reply options" })
          .click();
      }
      await expect(
        composer.getByRole("button", { name: /Suggest hashtags/ }),
      ).toBeVisible();
      await expect(
        composer.getByRole("button", { name: /Translate this/ }),
      ).toBeVisible();
      await expect(
        composer.getByRole("button", { name: /Attach media/ }),
      ).toBeVisible();
      await expect(
        composer.getByRole("button", { name: "Post", exact: true }),
      ).toBeVisible();
      expect(
        await composer
          .locator(".compose")
          .evaluate((element) => element.scrollWidth <= element.clientWidth),
      ).toBe(true);
      const bounds = await composer.locator(".compose").boundingBox();
      for (const button of await composer
        .locator(".compose-tools button")
        .all()) {
        if (!(await button.isVisible())) continue;
        const box = await button.boundingBox();
        expect(box.x).toBeGreaterThanOrEqual(bounds.x);
        expect(box.x + box.width).toBeLessThanOrEqual(
          bounds.x + bounds.width + 1,
        );
      }
      await composer
        .getByRole("button", { name: "Mark media sensitive" })
        .click();
      await expect(
        composer.getByRole("button", { name: "Mark media sensitive" }),
      ).toHaveAttribute("aria-pressed", "true");
      await composer.getByRole("button", { name: "Insert emoji" }).click();
      await expect(composer.locator("em-emoji-picker")).toBeVisible();
      const picker = await composer.locator("em-emoji-picker").boundingBox();
      expect(picker.x).toBeGreaterThanOrEqual(bounds.x);
      expect(picker.x + picker.width).toBeLessThanOrEqual(
        bounds.x + bounds.width + 1,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({ path: testInfo.outputPath("composer.png") });
    });
  }
}
