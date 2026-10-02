import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const url =
  "/iframe.html?id=adoption-shared-dialogs--interactive&viewMode=story";
const errors = new WeakMap();

test.beforeEach(async ({ page }) => {
  const messages = [];
  errors.set(page, messages);
  page.on("pageerror", (error) => messages.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") messages.push(message.text());
  });
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Shared dialogs: migration batch 1" }),
  ).toBeVisible();
});

test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

test("report fields, disclosure, Escape and focus restoration", async ({
  page,
}) => {
  const opener = page.getByRole("button", {
    name: "Report a bug",
    exact: true,
  });
  await opener.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveJSProperty("open", true);
  await dialog
    .getByRole("textbox", { name: "What happened?" })
    .fill("Fixture reproduction");
  await dialog.locator("summary").click();
  await expect(dialog.locator("pre")).toContainText("Fixture reproduction");
  await expect(dialog.locator("pre")).toContainText("Fixture error");
  await dialog.getByRole("checkbox", { name: /most recent error/ }).uncheck();
  await expect(dialog.locator("pre")).not.toContainText("Fixture error");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
});

test("bulk add retains pending state, per-handle outcomes and done action", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Add people", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const action = dialog.locator("footer button").last();
  await expect(action).toBeDisabled();
  await dialog
    .getByRole("textbox", { name: "Add people by name" })
    .fill("@alice @missing @error");
  await action.click();
  await expect(action).toBeDisabled();
  await expect(dialog.locator(".result-added")).toHaveCount(1);
  await expect(dialog.locator(".result-notfound")).toHaveCount(1);
  await expect(dialog.locator(".result-error")).toHaveCount(1);
  await expect(action).toBeEnabled();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Added: 1");
});

test("bulk planning can stop and retry; only explicit confirmation confirms", async ({
  page,
}) => {
  const opener = page.getByRole("button", { name: "Review bulk action" });
  await opener.click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toHaveJSProperty("open", true);
  await expect(dialog.locator('button[data-tone="danger"]')).toHaveCount(0);
  await dialog.getByRole("button", { name: "Stop counting" }).click();
  await expect(dialog).toContainText("Nothing has been changed");
  await dialog.getByRole("button", { name: "Count again" }).click();
  await expect(dialog).toContainText("Community correspondents");
  await dialog.locator('button[data-tone="danger"]').click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Confirmed: 1");
  await expect(opener).toBeFocused();
  await opener.click();
  await expect(dialog).toHaveJSProperty("open", true);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("Confirmed: 1");
});

for (const theme of ["light", "dark"]) {
  test(`narrow ${theme} dialog stays within viewport and traps focus`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(url + "&globals=theme:" + theme + ";accent:purple");
    await page
      .getByRole("button", { name: "Report a bug", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const bounds = await dialog.boundingBox();
    await page.screenshot({ path: testInfo.outputPath("dialog.png") });
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    const first = dialog.getByRole("textbox");
    await first.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(
      dialog.getByRole("button", { name: "Open GitHub issue" }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(first).toBeFocused();
  });
}
