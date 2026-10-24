import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
for (const [width, theme, direction] of [
  [1280, "light", "ltr"],
  [375, "dark", "ltr"],
  [320, "light", "rtl"],
]) {
  test(`Home and Algo Settings fits ${width}px ${theme} ${direction} and preserves the two-level picker`, async ({
    page,
  }, testInfo) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(
      `/iframe.html?id=adoption-home-and-algo--settings&viewMode=story&globals=theme:${theme};direction:${direction}`,
    );
    await expect(
      page.getByRole("heading", { name: "Home and Algo", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("combobox", { name: "Home feed", exact: true })
      .selectOption("favorite");
    await page
      .getByRole("combobox", { name: "Feed", exact: true })
      .selectOption("cats");
    await page
      .getByRole("button", { name: "Save changes", exact: true })
      .click();
    await expect(page.getByRole("status")).toContainText("Saved");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("settings.png"),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}
