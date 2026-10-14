import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const url =
  "/iframe.html?id=start-here-sprint-19-review--post-menu&viewMode=story";
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const messages = [];
  errors.set(page, messages);
  page.on("pageerror", (e) => messages.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") messages.push(e.text());
  });
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));

async function load(page, globals = "") {
  await page.goto(`${url}${globals ? `&globals=${globals}` : ""}`);
  await expect(
    page.getByRole("heading", { name: "Post ••• menu." }),
  ).toBeVisible();
}
const card = (page, name = "Sample post") =>
  page.getByRole("article", { name, exact: true });
const trigger = (page, name) =>
  card(page, name).getByRole("button", {
    name: "More actions for this post",
    exact: true,
  });
const menu = (page) => page.locator("[popover]:popover-open");
const row = (page, name) =>
  menu(page).getByRole("button", { name, exact: true });
const log = (page) => page.locator("[data-log]");

test("opens by keyboard on the first row; Escape closes and returns focus to •••", async ({
  page,
}) => {
  await load(page);
  await trigger(page).focus();
  await page.keyboard.press("Enter");
  await expect(menu(page)).toBeVisible();
  await expect(trigger(page)).toHaveAttribute("aria-expanded", "true");
  await expect(row(page, "Mute #pizza…")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(row(page, "Mute #cooking…")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu(page)).toHaveCount(0);
  await expect(trigger(page)).toBeFocused();
  await expect(trigger(page)).toHaveAttribute("aria-expanded", "false");
  await expect(log(page)).toHaveText("Last action: Menu closed");
});

test("the Close row and a tap outside both dismiss without opening the post", async ({
  page,
}) => {
  await load(page);
  await trigger(page).click();
  const close = row(page, "Close menu");
  await expect(close).toBeVisible();
  expect(
    await menu(page).evaluate((panel) => panel.lastElementChild.textContent),
  ).toContain("Close menu");
  await close.click();
  await expect(menu(page)).toHaveCount(0);
  await expect(trigger(page)).toBeFocused();
  await trigger(page).click();
  await expect(menu(page)).toBeVisible();
  await page.getByRole("heading", { name: "Post ••• menu." }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(log(page)).toHaveText("Last action: Menu closed");
});

test("toggles stay open, commands close, links stay native and nothing reaches the card", async ({
  page,
}) => {
  await load(page);
  await trigger(page).click();
  const like = row(page, "Private like");
  await like.click();
  await expect(row(page, "Remove private like")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(menu(page)).toBeVisible();
  const original = menu(page).getByRole("link", {
    name: "Open post on original site ↗",
  });
  await expect(original).toHaveAttribute(
    "href",
    "https://social.example/@pizza/1",
  );
  await expect(original).toHaveAttribute("target", "_blank");
  await row(page, "Save as to-do").click();
  await expect(menu(page)).toHaveCount(0);
  await expect(log(page)).toHaveText("Last action: Saved as to-do");
  await expect(trigger(page)).toBeFocused();
  await trigger(page).click();
  await menu(page)
    .getByRole("group", { name: "Mute @pizza@social.example for" })
    .getByRole("button", { name: "1 day", exact: true })
    .click();
  await expect(menu(page)).toHaveCount(0);
  await expect(log(page)).toHaveText("Last action: Muted for 1 day");
  await trigger(page).click();
  await expect(row(page, "Unmute @pizza@social.example")).toBeVisible();
  await expect(row(page, "Block @pizza@social.example")).toHaveCount(0);
});

test("own posts and providers without server actions keep only their rows", async ({
  page,
}) => {
  await load(page);
  await page.getByRole("button", { name: "Own post", exact: true }).click();
  await trigger(page).click();
  await expect(row(page, "Mute this post")).toHaveCount(0);
  await expect(row(page, "Report post")).toHaveCount(0);
  await expect(row(page, "Close menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "No server actions", exact: true })
    .click();
  await trigger(page).click();
  await expect(row(page, "Block @pizza@social.example")).toBeVisible();
  await expect(row(page, "Report post")).toHaveCount(0);
});

test("seven hashtags collapse behind one row that reveals a bounded list", async ({
  page,
}) => {
  await load(page);
  await page.getByRole("button", { name: "7 hashtags", exact: true }).click();
  await trigger(page).click();
  const toggle = row(page, "Mute a hashtag (7)");
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await expect(row(page, "Mute #pizza…")).toHaveCount(0);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const list = page.locator(`#${await toggle.getAttribute("aria-controls")}`);
  await expect(list.getByRole("button")).toHaveCount(7);
  await expect(menu(page)).toBeVisible();
  await list.getByRole("button", { name: "Mute #ovens…" }).click();
  await expect(menu(page)).toHaveCount(0);
  await expect(log(page)).toHaveText("Last action: Mute #ovens");
});

/** The open panel is fully on screen and does not overlap its trigger. */
async function expectBesideTrigger(page, name) {
  const panel = await menu(page).boundingBox();
  const button = await trigger(page, name).boundingBox();
  const view = page.viewportSize();
  expect(panel.x).toBeGreaterThanOrEqual(0);
  expect(panel.y).toBeGreaterThanOrEqual(0);
  expect(panel.x + panel.width).toBeLessThanOrEqual(view.width);
  expect(panel.y + panel.height).toBeLessThanOrEqual(view.height);
  const overlaps =
    panel.x < button.x + button.width &&
    button.x < panel.x + panel.width &&
    panel.y < button.y + button.height &&
    button.y < panel.y + panel.height;
  expect(overlaps).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}

for (const [width, theme, direction] of [
  [1280, "light", "ltr"],
  [375, "dark", "ltr"],
  [320, "light", "rtl"],
]) {
  test(`post menu ${width} ${theme} ${direction}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 800 });
    await load(page, `theme:${theme};direction:${direction}`);
    await page.getByRole("button", { name: "7 hashtags", exact: true }).click();
    await trigger(page).click();
    await row(page, "Mute a hashtag (7)").click();
    await expectBesideTrigger(page);
    await page.screenshot({ path: info.outputPath("menu.png") });
    await page.keyboard.press("Escape");

    const bottom = "Post near the bottom of the screen";
    await trigger(page, bottom).evaluate((el) =>
      el.scrollIntoView({ block: "end" }),
    );
    await trigger(page, bottom).click();
    await expectBesideTrigger(page, bottom);
    const panel = await menu(page).boundingBox();
    const button = await trigger(page, bottom).boundingBox();
    expect(panel.y + panel.height).toBeLessThanOrEqual(button.y);
    await page.screenshot({ path: info.outputPath("menu-bottom.png") });
  });
}

test("a menu taller than the screen scrolls inside its panel and never covers •••", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 375, height: 420 });
  await load(page, "theme:dark");
  await page.getByRole("button", { name: "7 hashtags", exact: true }).click();
  await trigger(page).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await trigger(page).click();
  await row(page, "Mute a hashtag (7)").click();
  await expectBesideTrigger(page);
  expect(
    await menu(page).evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true);
  await row(page, "Close menu").scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("menu-short.png") });
  await row(page, "Close menu").click();
  await expect(menu(page)).toHaveCount(0);
  await expect(trigger(page)).toBeFocused();
});
