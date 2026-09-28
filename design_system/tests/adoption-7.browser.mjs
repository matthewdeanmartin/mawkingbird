import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const review =
  "/iframe.html?id=start-here-sprint-7-review--app-controls&viewMode=story";
const failures = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  failures.set(page, errors);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") errors.push(e.text());
  });
});
test.afterEach(async ({ page }) => expect(failures.get(page)).toEqual([]));
test("real Privacy controls roll back failed saves and retry with only the changed field", async ({
  page,
}) => {
  await page.goto(review);
  const scope = page.getByRole("region", { name: "Privacy adoption" });
  const locked = scope.getByRole("checkbox", {
    name: "Require follow requests",
    exact: true,
  });
  await scope.getByText("Require follow requests", { exact: true }).click();
  await expect(locked).toBeDisabled();
  await expect(locked).not.toBeChecked();
  await expect(locked).toBeEnabled();
  await expect(scope.getByRole("alert")).toHaveCount(1);
  await expect(page.locator("output").first()).toHaveText('{"locked":"true"}');
  await locked.check();
  await expect(locked).toBeEnabled();
  await expect(locked).toBeChecked();
  await expect(scope.getByRole("alert")).toHaveCount(0);
  await expect(scope.getByRole("status")).toHaveText(/Saved/);
  for (const [name, key] of [
    ["This is an automated account", "bot"],
    ["Mark media as sensitive by default", "source[sensitive]"],
  ]) {
    const control = scope.getByRole("checkbox", { name, exact: true });
    await control.check();
    await expect(control).toBeEnabled();
    await expect(control).toBeChecked();
    await expect(page.locator("output").first()).toHaveText(
      JSON.stringify({ [key]: "true" }),
    );
  }
  const discovery = scope.getByRole("checkbox", {
    name: "Feature profile and posts in discovery algorithms",
    exact: true,
  });
  await discovery.uncheck();
  await expect(discovery).toBeEnabled();
  await expect(page.locator("output").first()).toHaveText(
    '{"discoverable":"false"}',
  );
});
test("real admin publish checkbox controls draft creation", async ({
  page,
}) => {
  await page.goto(review);
  const scope = page.getByRole("region", { name: "Announcement adoption" });
  await scope.getByText("Publish immediately", { exact: true }).click();
  await expect(
    scope.getByRole("checkbox", { name: "Publish immediately" }),
  ).not.toBeChecked();
  await scope.locator("textarea").fill("Morning review draft");
  await scope.getByRole("button", { name: "Create", exact: true }).click();
  await expect(page.locator("output").last()).toHaveText(
    '{"content":"Morning review draft","published":false}',
  );
  await expect(scope.getByText("Draft", { exact: true })).toBeVisible();
  await expect(scope.locator("textarea")).toHaveValue("");
});
for (const [theme, width, direction] of [
  ["light", 1280, "ltr"],
  ["dark", 380, "ltr"],
  ["light", 380, "rtl"],
]) {
  test(`adopted checkboxes ${theme} ${width} ${direction}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${review}&globals=theme:${theme};direction:${direction}`);
    await expect(page.locator("mb-checkbox")).toHaveCount(6);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    for (const widget of await page.locator("mb-checkbox").all()) {
      const box = await widget.locator("input").boundingBox();
      const label = await widget.locator("label").boundingBox();
      expect(Math.abs(label.y - box.y)).toBeLessThan(6);
      const gap =
        direction === "rtl"
          ? box.x - (label.x + label.width)
          : label.x - (box.x + box.width);
      expect(gap).toBeGreaterThanOrEqual(6);
    }
    await page.screenshot({
      path: info.outputPath("adoption.png"),
      fullPage: true,
    });
  });
}
