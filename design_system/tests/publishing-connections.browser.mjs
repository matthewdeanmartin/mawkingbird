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
      await page.setViewportSize({ width: 320, height: 1000 });
    });
    test.afterEach(async ({ page }, testInfo) => {
      expect(errors.get(page)).toEqual([]);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`${direction}.png`),
        fullPage: true,
      });
    });
    const url = (story) =>
      `/iframe.html?id=${story}&viewMode=story&globals=theme:${direction === "rtl" ? "dark" : "light"};accent:purple;direction:${direction}`;

    test("Blogger radio selection, profile opt-in, sign-out versus forget", async ({
      page,
    }) => {
      await page.goto(url("adoption-publishing-connections--blogger"));
      const first = page.getByRole("radio", {
        name: "First preview blog",
        exact: true,
      });
      await first.check();
      await expect(first).toBeChecked();
      await first.focus();
      await page.keyboard.press("ArrowDown");
      await expect(
        page.getByRole("radio", { name: "Second preview blog", exact: true }),
      ).toBeChecked();
      const include = page.getByRole("checkbox", {
        name: "Include my blog's posts in my profile feed",
        exact: true,
      });
      await include.check();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(include).toBeChecked();
      await expect(page.getByText(/still remembered/)).toBeVisible();
      await page
        .getByRole("button", { name: "Forget this blog", exact: true })
        .click();
      await expect(include).toHaveCount(0);
      const details = page.locator("mb-disclosure details");
      if (!(await details.getAttribute("open"))) {
        if (!(await details.evaluate((element) => element.open)))
          await details.locator("summary").click();
      }
      await page
        .getByLabel("Your OAuth client id", { exact: true })
        .fill("preview-client");
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await expect(page.locator('mb-notice [role="status"]')).toBeVisible();
    });

    test("Hugo native validation, rejected credential, profile and POSSE choices", async ({
      page,
    }) => {
      await page.goto(url("adoption-publishing-connections--hugo"));
      const token = page.getByLabel("GitHub token", { exact: true });
      await token.fill("reject");
      await page.getByLabel("Repository", { exact: true }).fill("preview/blog");
      await page
        .getByLabel("Site address", { exact: true })
        .fill("https://example.test");
      const save = page.getByRole("button", {
        name: "Save and check repository",
        exact: true,
      });
      await save.click();
      await expect(page.locator('mb-notice [role="alert"]')).toHaveText(
        "Preview repository rejected.",
      );
      await expect(token).toHaveValue("reject");
      await token.fill("preview");
      await save.click();
      const profile = page.getByRole("checkbox", {
        name: "Include my blog's posts on my profile",
        exact: true,
      });
      await profile.check();
      await expect(profile).toBeChecked();
      const posse = page.getByRole("checkbox", {
        name: "Record interactions on my blog",
        exact: true,
      });
      await posse.check();
      await expect(posse).toBeChecked();
      await page
        .getByRole("button", { name: "Disconnect", exact: true })
        .click();
      await expect(token).toHaveValue("");
    });

    test("Mataroa requires explicit proxy consent and rolls back rejected keys", async ({
      page,
    }) => {
      await page.goto(url("adoption-publishing-connections--mataroa"));
      const key = page.getByLabel("API key", { exact: true });
      await key.fill("reject");
      await page
        .getByLabel("Public blog address", { exact: true })
        .fill("https://preview.mataroa.blog");
      const save = page.getByRole("button", {
        name: "Save and test connection",
        exact: true,
      });
      await expect(save).toBeDisabled();
      const consent = page.getByRole("checkbox", {
        name: /I understand that Preview proxy/,
      });
      await consent.check();
      await save.click();
      await expect(page.locator('mb-notice [role="alert"]')).toContainText(
        "Preview rejection",
      );
      await expect(key).toHaveValue("reject");
      await key.fill("preview");
      await save.click();
      await expect(page.locator('mb-notice [role="status"]')).toBeVisible();
      await page
        .getByRole("checkbox", {
          name: "Include my blog's RSS feed in my profile feed",
          exact: true,
        })
        .check();
      await page
        .getByRole("button", { name: "Disconnect", exact: true })
        .click();
      await expect(consent).not.toBeChecked();
      await expect(save).toBeDisabled();
    });

    test("Paste inspection is separate from default selection and feed consent", async ({
      page,
    }) => {
      await page.goto(url("adoption-publishing-connections--pastes"));
      await page
        .getByRole("radio", { name: "GitHub Gist", exact: true })
        .check();
      const activate = page.getByRole("button", {
        name: "Make default",
        exact: true,
      });
      await expect(activate).toBeEnabled();
      await activate.click();
      await expect(activate).toBeDisabled();
      await page.getByRole("button", { name: "Follow", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Unfollow", exact: true }),
      ).toBeVisible();
      const proxy = page.getByRole("checkbox", {
        name: "Use my configured CORS proxy",
        exact: true,
      });
      await expect(proxy).not.toBeChecked();
      await proxy.check();
      await expect(proxy).toBeChecked();
    });

    test("Twitter spending, local follow visibility and import inclusion", async ({
      page,
    }) => {
      await page.goto(url("adoption-account-connections--twitter-controls"));
      await page.getByText("Change the daily limits", { exact: true }).click();
      await page.getByLabel("Stop at", { exact: true }).fill("300");
      await page
        .getByRole("button", { name: "Save limits", exact: true })
        .click();
      const show = page.locator(".follow-row").getByRole("checkbox");
      await show.uncheck();
      await expect(show).not.toBeChecked();
      await show.check();
      const include = page
        .locator(".import-row")
        .getByRole("checkbox", { name: "Include", exact: true });
      await include.uncheck();
      await expect(page.locator(".import-row")).toHaveClass(/excluded/);
      await include.check();
      await expect(page.locator(".import-row")).not.toHaveClass(/excluded/);
      await page.getByRole("button", { name: /^Import 1 account/ }).click();
      await expect(page.locator(".follow-row")).toHaveCount(2);
      await expect(page.locator(".import-row")).toHaveCount(0);
    });
  });
}
