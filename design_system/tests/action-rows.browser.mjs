import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");

const url = (globals) =>
  `/iframe.html?id=actions-action-rows--patterns&viewMode=story&globals=${globals}`;
const fits = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

for (const direction of ["ltr", "rtl"]) {
  for (const theme of ["light", "dark"]) {
    test(`action rows fit wide and narrow: ${theme}, ${direction}`, async ({
      page,
    }) => {
      for (const width of [1280, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(url(`theme:${theme};direction:${direction}`));
        const row = page.locator("li[mbItemRow]").first();
        await expect(row).toBeVisible();
        expect(await fits(page)).toBe(true);
        const toolbar = await row.getByRole("toolbar").boundingBox();
        const bounds = await row.boundingBox();
        // Actions sit inside their row, at the far end while there is room.
        expect(toolbar.x).toBeGreaterThanOrEqual(bounds.x - 1);
        expect(toolbar.x + toolbar.width).toBeLessThanOrEqual(
          bounds.x + bounds.width + 1,
        );
      }
    });
  }
}

test("an add box lines its button up with the control, not the label or hint", async ({
  page,
}) => {
  await page.goto(url("theme:light"));
  const form = page.locator("form[mbAddBox]").first();
  const control = await form.locator("input").boundingBox();
  const button = await form.locator("button").boundingBox();
  const middle = (box) => box.y + box.height / 2;
  expect(Math.abs(middle(control) - middle(button))).toBeLessThan(2);
  expect(button.x).toBeGreaterThan(control.x + control.width);
});

test("an empty add box stays enabled, focuses its control and submits nothing", async ({
  page,
}) => {
  await page.goto(url("theme:light"));
  const form = page.locator("form[mbAddBox]").first();
  const button = form.getByRole("button", { name: "Subscribe" });
  await expect(button).toBeEnabled();
  await button.click();
  await expect(form.locator("input")).toBeFocused();
  await expect(page.getByRole("status")).toHaveText("Added 0");
  await form.locator("input").fill("@example");
  await button.click();
  await expect(page.getByRole("status")).toHaveText("Added 1");
});

test("labelled actions show words when wide and keep their names as icons", async ({
  page,
}) => {
  await page.goto(url("theme:light"));
  const group = page.getByRole("group", { name: "Video actions" });
  const queue = group.getByRole("button", { name: "In queue" });
  await expect(queue).toHaveAttribute("aria-pressed", "true");
  expect((await queue.boundingBox()).width).toBeGreaterThan(60);
  await page.setViewportSize({ width: 390, height: 900 });
  await expect(queue).toHaveAttribute("title", "In queue");
  expect((await queue.boundingBox()).width).toBeLessThan(60);
  await expect(
    group.getByRole("link", { name: "Open on YouTube" }),
  ).toHaveAttribute("target", "_blank");
});
