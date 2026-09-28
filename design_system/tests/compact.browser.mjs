import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const story =
  "/iframe.html?id=adoption-sprint-3-toolbars--stacked-compact&viewMode=story";

for (const [theme, width, direction] of [
  ["light", 1280, "ltr"],
  ["dark", 380, "ltr"],
  ["light", 380, "rtl"],
]) {
  test(`compact stack and consent alignment ${theme} ${width} ${direction}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${story}&globals=theme:${theme};direction:${direction}`);
    await expect(
      page.getByRole("checkbox", { name: "Count my page views" }),
    ).toBeVisible();
    if (width === 1280) {
      const rows = page.locator(".command-row, .reader-toolbar");
      await expect(rows).toHaveCount(4);
      for (const row of await rows.all())
        expect((await row.boundingBox()).height).toBeLessThanOrEqual(36);
      expect(
        (await page.locator(".stacked-controls").boundingBox()).height,
      ).toBeLessThanOrEqual(144);
    }
    const checkbox = page.getByRole("checkbox", {
      name: "Count my page views",
    });
    await page.locator("mb-checkbox label").click();
    await expect(checkbox).not.toBeChecked();
    const label = await page.locator("mb-checkbox label").boundingBox();
    const hint = await page.locator("mb-checkbox .hint").boundingBox();
    const control = await checkbox.boundingBox();
    const edge = (box) => (direction === "rtl" ? box.x + box.width : box.x);
    expect(Math.abs(edge(label) - edge(hint))).toBeLessThan(1);
    expect(
      Math.abs(control.y + control.height / 2 - (label.y + 10.5)),
    ).toBeLessThan(3);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("compact-stack.png"),
      fullPage: true,
    });
  });
}

test("compact toolbar keeps touch targets usable", async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:6008${story}`);
  await expect(
    page.getByRole("checkbox", { name: "Count my page views" }),
  ).toBeVisible();
  for (const button of await page.locator("button[mbToolbarButton]").all()) {
    const box = await button.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await context.close();
});
