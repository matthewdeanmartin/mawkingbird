import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const url =
  "/iframe.html?id=start-here-sprint-15-review--privacy-and-trust&viewMode=story";
const errors = new WeakMap();
const click = (page, name) =>
  page.getByRole("button", { name, exact: true }).click();
test.beforeEach(async ({ page }) => {
  const messages = [];
  errors.set(page, messages);
  page.on("pageerror", (e) => messages.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") messages.push(e.text());
  });
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Settings forms with shared controls." }),
  ).toBeVisible();
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
for (const [label, key, value, old] of [
  ["Post visibility", "privacy", "private", "public"],
  ["Posting language", "language", "eo", "en"],
]) {
  test(`${label} retains one-field writes, pending state, rollback and retry`, async ({
    page,
  }) => {
    const scope = page.getByRole("region", { name: "Privacy form" }),
      control = scope.getByRole("combobox", { name: label, exact: true });
    await expect(control).toHaveValue(old);
    await page.clock.install({ time: 0 });
    await page.clock.pauseAt(1000);
    await control.selectOption(value);
    await page.clock.runFor(32);
    await expect(control).toBeDisabled();
    await page.clock.runFor(400);
    await expect(control).toHaveValue(old);
    await expect(control).toBeEnabled();
    await expect(control).toHaveAttribute("aria-invalid", "true");
    await expect(scope.getByRole("alert")).toContainText("503");
    await expect(page.locator("[data-defaults]")).toHaveText("public / en");
    await expect(page.locator("[data-requests]")).toHaveText(
      JSON.stringify({ [`source[${key}]`]: value }),
    );
    await control.selectOption(value);
    await page.clock.runFor(32);
    await expect(control).toBeDisabled();
    await page.clock.runFor(400);
    await expect(control).toHaveValue(value);
    await expect(control).toBeEnabled();
    await expect(scope.getByRole("alert")).toHaveCount(0);
    await expect(scope.getByRole("status")).toHaveText("Saved ✓");
    await expect(page.locator("[data-count]")).toHaveText("2");
    await expect(page.locator("[data-defaults]")).toHaveText(
      key === "language" ? "public / eo" : "private / en",
    );
    const described = await control.getAttribute("aria-describedby");
    expect(described).toBeTruthy();
    await expect(page.locator(`[id="${described}"]`)).toContainText("Default");
  });
}
test("clearing posting language preserves the explicit empty value", async ({
  page,
}) => {
  await click(page, "Success");
  const control = page.getByRole("combobox", {
    name: "Posting language",
    exact: true,
  });
  await control.selectOption("");
  await expect(control).toBeEnabled();
  await expect(page.locator("[data-requests]")).toHaveText(
    '{"source[language]":""}',
  );
  await expect(control).toHaveValue("");
  await expect(page.locator("[data-defaults]")).toHaveText("public /");
});
test("trust radio keyboard choices preserve people and reversible local switches", async ({
  page,
}) => {
  await click(page, "Trust");
  const scope = page.getByRole("region", { name: "Trust form" });
  const storage = await page.evaluate(() =>
    JSON.stringify({ ...localStorage }),
  );
  const individuals = scope.getByRole("radio", {
    name: "Trust individual people",
    exact: true,
  });
  await expect(individuals).toBeChecked();
  await individuals.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    scope.getByRole("radio", { name: "Trust everyone I follow", exact: true }),
  ).toBeChecked();
  await page.keyboard.press("ArrowDown");
  await expect(
    scope.getByRole("radio", {
      name: "Trust everyone I follow, and what they boost",
      exact: true,
    }),
  ).toBeChecked();
  const cw = scope.getByRole("checkbox", {
    name: "Auto-expand content warnings",
    exact: true,
  });
  await cw.check();
  await scope.getByRole("radio", { name: "Trust no one", exact: true }).check();
  await expect(cw).toBeDisabled();
  await expect(cw).toBeChecked();
  await expect(page.locator("[data-trust]")).toHaveText(
    "none / CW true / sensitive false / people 1",
  );
  await individuals.check();
  await expect(cw).toBeEnabled();
  await expect(cw).toBeChecked();
  await scope
    .getByRole("checkbox", { name: "Auto-show sensitive media", exact: true })
    .check();
  await expect(page.locator("[data-trust]")).toHaveText(
    "individuals / CW true / sensitive true / people 1",
  );
  await expect(page.locator("[data-count]")).toHaveText("0");
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).toBe(
    storage,
  );
});
test("trust keeps the server link and destructive confirmation boundary", async ({
  page,
}) => {
  await click(page, "Trust");
  const scope = page.getByRole("region", { name: "Trust form" });
  await expect(
    scope.getByRole("link", { name: "Change it there", exact: true }),
  ).toHaveAttribute("href", "https://example.test/settings/preferences/other");
  await click(page, "Revoke all trust");
  await expect(page.locator("[data-confirmation]")).toHaveText(
    "Confirmation requested; simulated Cancel.",
  );
  await expect(page.locator("[data-trust]")).toContainText("people 1");
});
for (const [width, theme, direction] of [
  [1280, "light", "ltr"],
  [375, "dark", "ltr"],
  [320, "light", "rtl"],
]) {
  test(`settings composition ${width} ${theme} ${direction}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${url}&globals=theme:${theme};direction:${direction}`);
    for (const name of ["Privacy", "Trust"]) {
      await click(page, name);
      const scope = page.getByRole("region", { name: `${name} form` });
      await expect(scope).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      ).toBe(true);
      for (const el of await scope
        .locator("mb-checkbox, mb-radio-group, mb-settings-row, mb-field")
        .all())
        expect(
          await el.evaluate((e) => e.scrollWidth <= e.clientWidth + 1),
        ).toBe(true);
      if (name === "Privacy") {
        const visibility = await scope
          .getByRole("combobox", { name: "Post visibility", exact: true })
          .boundingBox();
        const language = await scope
          .getByRole("combobox", { name: "Posting language", exact: true })
          .boundingBox();
        const media = await scope
          .getByRole("checkbox", {
            name: "Mark media as sensitive by default",
            exact: true,
          })
          .boundingBox();
        expect(visibility.width).toBeLessThanOrEqual(384);
        expect(Math.abs(visibility.x - language.x)).toBeLessThanOrEqual(1);
        const edge = (box) => (direction === "rtl" ? box.x + box.width : box.x);
        expect(Math.abs(edge(visibility) - edge(media))).toBeLessThanOrEqual(1);
      }
      await scope.screenshot({ path: info.outputPath(`${name}.png`) });
    }
  });
}
