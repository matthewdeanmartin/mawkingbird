import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const review =
  "/iframe.html?id=start-here-sprint-9-review--app-dialogs-review&viewMode=story";
const failures = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  failures.set(page, errors);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") errors.push(e.text());
  });
  await page.goto(review);
  await expect(
    page.getByRole("heading", { name: "Shared dialogs in real flows." }),
  ).toBeVisible();
});
test.afterEach(async ({ page }) => expect(failures.get(page)).toEqual([]));

test("real service confirms, cancels and restores focus", async ({ page }) => {
  const opener = page.getByRole("button", {
    name: "Destructive confirmation",
    exact: true,
  });
  await opener.click();
  const modal = page.getByRole("alertdialog", { name: "Remove this item?" });
  await expect(modal).toBeVisible();
  await expect(
    modal.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    modal.getByRole("button", { name: "Remove", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    modal.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  await expect(page.locator("output")).toHaveText("Cancelled");
  await expect(opener).toBeFocused();
  await opener.click();
  await modal.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.locator("output")).toHaveText("Confirmed");
  await expect(opener).toBeFocused();
});
test("prompt preserves input and empty Enter result; backdrop cancels", async ({
  page,
}) => {
  const opener = page.getByRole("button", { name: "Editable prompt" });
  await opener.click();
  const modal = page.getByRole("alertdialog", { name: "Rename list" });
  const input = modal.getByRole("textbox", { name: "List name" });
  await expect(input).toHaveValue("Morning list");
  await expect(input).toBeFocused();
  await input.fill("");
  await input.press("Enter");
  await expect(page.locator("output")).toHaveText('""');
  await expect(opener).toBeFocused();
  await opener.click();
  // Raw pointer actions do not wait for the asynchronously mounted modal.
  await expect(modal).toHaveJSProperty("open", true);
  await expect(input).toBeFocused();
  await page.mouse.click(2, 2);
  await expect(page.locator("output")).toHaveText("Cancelled");
  await expect(modal).toHaveCount(0);
});
test("service keeps queued dialogs sequential with a single alert action", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Two queued decisions" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await page
    .getByRole("alertdialog", { name: "First queued dialog" })
    .getByRole("button", { name: "Continue" })
    .click();
  const second = page.getByRole("alertdialog", {
    name: "Second queued dialog",
  });
  await expect(second).toBeVisible();
  await expect(page.locator("dialog[open]")).toHaveCount(1);
  await expect(second.getByRole("button")).toHaveCount(1);
  await second.getByRole("button", { name: "OK", exact: true }).click();
  await expect(page.locator("output")).toHaveText("Queue complete: confirmed");
});
test("nested service dialog dismisses only the child and retains the scroll lock", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Nested confirmation", exact: true })
    .click();
  const parent = page.getByRole("dialog", { name: "Parent dialog" });
  const opener = parent.getByRole("button", {
    name: "Open child confirmation",
  });
  await opener.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(parent).toBeVisible();
  await expect(opener).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.style.overflow),
  ).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(parent).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.style.overflow),
  ).not.toBe("hidden");
});
test("leave retains all choices and backup failure does not block exit", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Leave options" }).click();
  const modal = page.getByRole("dialog", { name: "Leave Anonymous?" });
  await expect(
    modal.getByRole("button", { name: /Delete anonymous data, then leave/ }),
  ).toBeVisible();
  await expect(
    modal.getByRole("button", { name: /Remove all browser data, then leave/ }),
  ).toBeVisible();
  await modal.getByRole("button", { name: "Download my data first" }).click();
  await expect(modal.getByRole("alert")).toHaveText(/Couldn't build a backup/);
  await modal.getByRole("button", { name: /Return to the login page/ }).click();
  await expect(modal).toHaveCount(0);
  await expect(page.locator("output")).toHaveText("leave");
});
test("translation retains busy state, failure retry and editable append result", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Translate a draft" }).click();
  const modal = page.getByRole("dialog", { name: /Translate this post/ });
  await expect(modal).toBeVisible();
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  const run = modal.getByRole("button", {
    name: "Translate to Esperanto",
    exact: true,
  });
  await run.click();
  await page.clock.runFor(32);
  await expect(modal.getByRole("combobox")).toBeDisabled();
  await expect(modal.getByRole("status")).toHaveText(/Translating into/);
  await page.clock.runFor(400);
  await expect(modal.getByRole("alert")).toHaveText(
    /Preview model unavailable/,
  );
  await run.click();
  await page.clock.runFor(400);
  const draft = modal.getByRole("textbox", { name: "Esperanto", exact: true });
  await expect(draft).toHaveValue("Saluton al ĉiuj");
  await draft.fill("Mia redaktita teksto");
  await page.clock.runFor(32);
  await modal.getByRole("button", { name: "Append", exact: true }).click();
  await page.clock.runFor(32);
  await expect(page.locator("output")).toHaveText(
    '{"text":"Mia redaktita teksto","mode":"append","code":"eo"}',
  );
});
for (const [theme, width, direction] of [
  ["light", 1280, "ltr"],
  ["dark", 380, "ltr"],
  ["light", 380, "rtl"],
]) {
  test(`adopted dialogs ${theme} ${width} ${direction}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto(`${review}&globals=theme:${theme};direction:${direction}`);
    for (const name of [
      "Destructive confirmation",
      "Editable prompt",
      "Leave options",
      "Translate a draft",
    ]) {
      await page.getByRole("button", { name, exact: true }).click();
      const modal = page.locator("dialog[open]");
      await expect(modal).toBeVisible();
      expect(
        await modal.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      const rect = await modal.boundingBox();
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(701);
      await page.screenshot({
        path: info.outputPath(`${name}.png`),
        fullPage: true,
      });
      await page.keyboard.press("Escape");
      await expect(modal).toHaveCount(0);
    }
  });
}

test("native child keeps legacy parent open and owns Tab and Escape", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Legacy parent confirmation" })
    .click();
  const parent = page.getByRole("dialog", {
    name: "Legacy parent",
    exact: true,
  });
  const opener = parent.getByRole("button", { name: "Open native child" });
  await opener.click();
  const child = page.getByRole("alertdialog");
  await expect(child).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  await expect(
    child.getByRole("button", { name: "Remove", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(child).toHaveCount(0);
  await expect(parent).toBeVisible();
  await expect(opener).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(parent).toHaveCount(0);
});

test("translation can still be dismissed during pending work without applying a result", async ({
  page,
}) => {
  const opener = page.getByRole("button", { name: "Translate a draft" });
  await opener.click();
  const modal = page.getByRole("dialog", { name: /Translate this post/ });
  await expect(modal).toBeVisible();
  await page.clock.install({ time: 0 });
  await page.clock.pauseAt(1000);
  await modal
    .getByRole("button", { name: "Translate to Esperanto", exact: true })
    .click();
  await page.clock.runFor(32);
  await expect(modal.getByRole("combobox")).toBeDisabled();
  await page.keyboard.press("Escape");
  await page.clock.runFor(32);
  await expect(modal).toHaveCount(0);
  await expect(opener).toBeFocused();
  await page.clock.runFor(400);
  await expect(page.locator("output")).toHaveText("No decision yet.");
});
