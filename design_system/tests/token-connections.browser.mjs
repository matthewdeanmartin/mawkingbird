import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");

for (const provider of ["github", "gist", "raindrop"]) {
  for (const variant of ["light", "dark-rtl"]) {
    test(`${provider}: ${variant} narrow credential flow`, async ({
      page,
    }, testInfo) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.setViewportSize({ width: 320, height: 1000 });
      await page.goto(
        `/iframe.html?id=adoption-token-connections--${provider === "github" ? "git-hub" : provider}&viewMode=story&globals=theme:${variant === "light" ? "light" : "dark"};accent:purple;direction:${variant === "light" ? "ltr" : "rtl"}`,
      );
      const input = page.locator("mb-field input");
      await expect(input).toBeVisible();
      await expect(input).toHaveAttribute("type", "password");
      await expect(input).toHaveAttribute("autocomplete", "off");
      expect(
        await input.evaluate((control) =>
          control.labels[0]?.textContent.trim(),
        ),
      ).toBeTruthy();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${provider}-${variant}-form.png`),
        fullPage: true,
      });
      const submit = page.locator("button[mbButton]").last();
      await input.fill("reject");
      await submit.click();
      await expect(page.getByRole("alert")).toBeVisible();
      await expect(input).toHaveValue("reject");
      await input.fill("preview-token");
      await submit.click();
      if (provider !== "raindrop") await expect(submit).toBeDisabled();
      await expect(
        page.getByRole("button", { name: "Disconnect", exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("alert")).toHaveCount(0);
      await expect(page.getByRole("status").last()).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${provider}-${variant}.png`),
        fullPage: true,
      });
      await page
        .getByRole("button", { name: "Disconnect", exact: true })
        .click();
      await expect(input).toHaveValue("");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}
