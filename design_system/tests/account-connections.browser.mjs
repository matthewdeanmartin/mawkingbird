import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");

for (const direction of ["ltr", "rtl"]) {
  test.describe(direction, () => {
    const errors = new WeakMap();
    test.beforeEach(async ({ page }) => {
      const messages = [];
      errors.set(page, messages);
      page.on("pageerror", (error) => messages.push(error.message));
      await page.setViewportSize({ width: 320, height: 900 });
    });
    test.afterEach(async ({ page }) => {
      expect(errors.get(page)).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    });
    const url = (provider) =>
      `/iframe.html?id=adoption-account-connections--${provider}&viewMode=story&globals=theme:${direction === "rtl" ? "dark" : "light"};accent:purple;direction:${direction}`;

    test("Twitter setup retains cost disclosures and reports blocked probes", async ({
      page,
    }) => {
      await page.goto(url("twitter-setup"));
      await expect(page.getByText(/costs up to two requests/)).toBeVisible();
      await page.locator('input[type="password"]').fill("preview-key");
      await page
        .getByRole("button", { name: "Save and test", exact: true })
        .click();
      await expect(page.locator('mb-notice [role="alert"]')).toHaveText(
        "Preview only: request blocked; no API key was sent.",
      );
      await page
        .getByRole("button", { name: "Disconnect", exact: true })
        .click();
      await expect(page.locator('mb-notice [role="status"]')).toContainText(
        "Disconnected",
      );
    });

    test("Mastodon opt-in, rejection, sign-out and disconnect stay distinct", async ({
      page,
    }) => {
      await page.goto(url("mastodon"));
      await page
        .getByRole("button", { name: /Read .* without an account/ })
        .click();
      const token = page.getByLabel("access token", { exact: true });
      await token.fill("reject");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.locator('mb-notice [role="alert"]')).toBeVisible();
      await expect(token).toHaveValue("reject");
      await token.fill("preview");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(token).toBeDisabled();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(token).toHaveValue("");
      await page
        .getByRole("button", { name: "Disconnect Mastodon", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: /Read .* without an account/ }),
      ).toBeVisible();
    });

    test("Bluesky labels, errors, pending state and unlink", async ({
      page,
    }, testInfo) => {
      await page.goto(url("bluesky"));
      await page
        .getByLabel("you.bsky.social", { exact: true })
        .fill("@preview.bsky.social");
      const password = page.getByLabel("app password", { exact: true });
      await password.fill("reject");
      await page
        .getByRole("button", { name: "Link Bluesky", exact: true })
        .click();
      await expect(page.locator('mb-notice [role="alert"]')).toBeVisible();
      await expect(password).toHaveValue("reject");
      await page.screenshot({
        path: testInfo.outputPath(`bluesky-${direction}.png`),
        fullPage: true,
      });
      await password.fill("preview");
      await page
        .getByRole("button", { name: "Link Bluesky", exact: true })
        .click();
      await expect(password).toBeDisabled();
      await page.getByRole("button", { name: "Unlink", exact: true }).click();
      await expect(password).toHaveValue("");
    });

    test("Dropbox modal scroll, focus containment and restoration", async ({
      page,
    }, testInfo) => {
      await page.goto(url("dropbox"));
      await page
        .getByRole("button", { name: "Connect Dropbox", exact: true })
        .click();
      const opener = page.getByRole("button", {
        name: "List files and folders",
        exact: true,
      });
      await opener.click();
      const dialog = page.getByRole("dialog", {
        name: "Dropbox files and folders",
      });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator(".dropbox-list")).toHaveCSS(
        "list-style-type",
        "none",
      );
      await expect(dialog.locator(".dropbox-list li").first()).toHaveCSS(
        "display",
        "flex",
      );
      await expect(
        dialog.getByRole("button", { name: "Close", exact: true }).first(),
      ).toBeFocused();
      await page.keyboard.press("Shift+Tab");
      await expect(
        dialog.getByRole("button", { name: "Close", exact: true }).last(),
      ).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(
        dialog.getByRole("button", { name: "Close", exact: true }).first(),
      ).toBeFocused();
      expect(
        await dialog.evaluate(
          (element) => element.scrollWidth <= element.clientWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`dropbox-${direction}.png`),
      });
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
      await opener.click();
      await dialog
        .getByRole("button", { name: "Close", exact: true })
        .last()
        .click();
      await expect(opener).toBeFocused();
      await page
        .getByRole("button", { name: "Disconnect", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Connect Dropbox", exact: true }),
      ).toBeVisible();
    });
  });
}
