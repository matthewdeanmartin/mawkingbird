import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const url =
  "/iframe.html?id=start-here-sprint-12-review--read-and-recover&viewMode=story";
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const messages = [];
  errors.set(page, messages);
  page.on("pageerror", (e) => messages.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") messages.push(e.text());
  });
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Post dialogs, one shared shell." }),
  ).toBeVisible();
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
const open = (page, name) =>
  page
    .getByRole("toolbar", { name: "Open post dialog" })
    .getByRole("button", { name, exact: true })
    .click();
const mode = (page, name) =>
  page
    .getByRole("toolbar", { name: "Next read response" })
    .getByRole("button", { name, exact: true })
    .click();
for (const [label, title, error, empty] of [
  [
    "Liked by",
    "Favourited by",
    "Could not load accounts. Try again.",
    "Nobody yet.",
  ],
  [
    "Boosted by",
    "Boosted by",
    "Could not load accounts. Try again.",
    "Nobody yet.",
  ],
  [
    "Edit history",
    "Edit history",
    "Could not load edit history. Try again.",
    "No history.",
  ],
  [
    "Public edit history",
    "Edit history",
    "Could not load edit history. Try again.",
    "No history.",
  ],
]) {
  test(`${label} distinguishes failure, retry, empty and cancelled loading`, async ({
    page,
  }) => {
    await mode(page, "Fail once");
    await open(page, label);
    let dialog = page.getByRole("dialog", { name: title, exact: true });
    await expect(dialog).toHaveJSProperty("open", true);
    await expect(dialog.getByRole("alert")).toHaveText(error);
    await expect(dialog.getByText(empty, { exact: true })).toHaveCount(0);
    await dialog.getByRole("button", { name: "Retry", exact: true }).click();
    await expect(dialog.locator("li")).toHaveCount(18);
    await expect(dialog.getByRole("alert")).toHaveCount(0);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(
      page
        .getByRole("toolbar", { name: "Open post dialog" })
        .getByRole("button", { name: label, exact: true }),
    ).toBeFocused();
    await mode(page, "Empty");
    await open(page, label);
    await expect(dialog.getByText(empty, { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await mode(page, "Hold");
    await open(page, label);
    await expect(dialog.getByRole("status")).toHaveText("Loading…");
    await expect(page.locator("[data-pending]")).toHaveText("1");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.locator("[data-pending]")).toHaveText("0");
    await expect(page.locator("[data-cancelled]")).toHaveText("1");
  });
}
test("native account links close the dialog and retain their destination", async ({
  page,
}) => {
  await open(page, "Liked by");
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("li")).toHaveCount(18);
  const link = dialog.getByRole("link").first();
  await expect(link).toHaveAttribute("href", "#/accounts/1");
  await link.click();
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(/#\/accounts\/1$/);
  await expect(
    page.getByText("Local preview destination: accounts/1"),
  ).toBeVisible();
});
test("nested history closes only its own modal and restores parent focus and scroll lock", async ({
  page,
}) => {
  await open(page, "Nested post dialogs");
  const parent = page.getByRole("dialog", {
    name: "Parent post tools",
    exact: true,
  });
  const childTrigger = parent.getByRole("button", {
    name: "Open child history",
    exact: true,
  });
  await childTrigger.click();
  await expect(
    page.getByRole("dialog", { name: "Edit history", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(childTrigger).toBeFocused();
  await expect(parent).toBeVisible();
  expect(await page.locator("html").evaluate((el) => el.style.overflow)).toBe(
    "hidden",
  );
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);
  expect(
    await page.locator("html").evaluate((el) => el.style.overflow),
  ).not.toBe("hidden");
});
test("sign-in prompt preserves cancellation, focus cycling and native account exits", async ({
  page,
}) => {
  await open(page, "Sign-in prompt");
  const dialog = page.getByRole("dialog", {
    name: "Sign in to like this",
    exact: true,
  });
  const cancel = dialog.getByRole("button", { name: "Not now", exact: true });
  await expect(cancel).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    dialog.getByRole("link", { name: "Sign in", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(cancel).toBeFocused();
  await cancel.click();
  await expect(page.locator("[data-exits]")).toHaveText("0");
  await open(page, "Sign-in prompt");
  await expect(
    dialog.getByRole("link", { name: "Create an account", exact: true }),
  ).toHaveAttribute("href", "#/welcome-back");
  const signIn = dialog.getByRole("link", { name: "Sign in", exact: true });
  await expect(signIn).not.toHaveAttribute("role", "button");
  await expect(signIn).toHaveAttribute("mbButton", "");
  const appearance = await signIn.evaluate((link) => {
    const probe = document.createElement("span");
    probe.style.backgroundColor = "var(--ds-action-fill)";
    document.body.append(probe);
    const expected = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return {
      expected,
      actual: getComputedStyle(link).backgroundColor,
      decoration: getComputedStyle(link).textDecorationLine,
    };
  });
  expect(appearance.actual).toBe(appearance.expected);
  expect(appearance.decoration).toBe("none");
  await dialog.getByRole("link", { name: "Sign in", exact: true }).click();
  await expect(page.locator("[data-exits]")).toHaveText("1");
  await expect(page).toHaveURL(/#\/login$/);
});
for (const [theme, width, direction] of [
  ["light", 1280, "ltr"],
  ["dark", 380, "ltr"],
  ["light", 320, "rtl"],
]) {
  test(`long dialog content ${theme} ${width} ${direction}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto(`${url}&globals=theme:${theme};direction:${direction}`);
    for (const label of ["Liked by", "Edit history", "Sign-in prompt"]) {
      await open(page, label);
      const dialog = page.getByRole("dialog");
      if (label !== "Sign-in prompt")
        await expect(dialog.locator("li")).toHaveCount(18);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator("html")).toHaveAttribute("dir", direction);
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true);
      expect(
        await dialog.evaluate(
          (el) => el.getBoundingClientRect().height <= innerHeight - 30,
        ),
      ).toBe(true);
      await dialog.screenshot({
        path: info.outputPath(label.replaceAll(" ", "-") + ".png"),
      });
      await page.keyboard.press("Escape");
    }
  });
}
