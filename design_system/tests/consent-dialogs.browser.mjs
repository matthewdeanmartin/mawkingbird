import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const url =
  "/iframe.html?id=adoption-consent-dialogs--interactive&viewMode=story";

for (const choice of [
  "Shortener key",
  "Shortener own proxy",
  "Shortener no key",
  "Twitter key",
  "Twitter own proxy",
]) {
  test(
    choice + ": dismissal is not consent; acceptance is explicit",
    async ({ page }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto(url);
      const opener = page.getByRole("button", { name: choice, exact: true });
      await opener.click();
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toHaveJSProperty("open", true);
      await expect(
        dialog.getByRole("button", { name: "Close", exact: true }),
      ).toBeFocused();
      const dangerous = !choice.includes("own") && !choice.includes("no key");
      await expect(dialog.locator("mb-notice")).toHaveCount(dangerous ? 1 : 0);
      if (choice === "Twitter key") {
        await expect(dialog).toContainText("reading history");
        await expect(dialog).toContainText("Spend your credits");
      }
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      await expect(page.getByRole("status")).toHaveText(
        "Accepted: 0. Cancelled: 1.",
      );
      await opener.click();
      await expect(dialog).toHaveJSProperty("open", true);
      await dialog
        .getByRole("button", { name: "No, don't send it", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      await opener.click();
      await expect(dialog).toHaveJSProperty("open", true);
      await dialog.locator("footer button").last().click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("status")).toHaveText(
        "Accepted: 1. Cancelled: 2.",
      );
      expect(errors).toEqual([]);
    },
  );
}

for (const theme of ["light", "dark"]) {
  test("long consent at 320px: " + theme, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(url + "&globals=theme:" + theme + ";accent:purple");
    await page
      .getByRole("button", { name: "Twitter key", exact: true })
      .click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toHaveJSProperty("open", true);
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    const bounds = await dialog.boundingBox();
    const closeBounds = await dialog
      .getByRole("button", { name: "Close", exact: true })
      .boundingBox();
    expect(closeBounds.height).toBeLessThanOrEqual(44);
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    await page.screenshot({ path: testInfo.outputPath("consent.png") });
    await page.keyboard.press("Shift+Tab");
    await expect(
      dialog.getByRole("button", { name: "I accept the risk", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      dialog.getByRole("button", { name: "Close", exact: true }),
    ).toBeFocused();
    await page.mouse.click(1, 1);
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("status")).toHaveText(
      "Accepted: 0. Cancelled: 1.",
    );
  });
}
