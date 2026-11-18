import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");

const story = (id) =>
  `/iframe.html?id=data-file-drop-progress-and-stats--${id}&viewMode=story`;

test("file drop is one native, keyboard-reachable input that fits a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(story("file-drop"));
  const input = page.getByLabel(/Drop your Twitter archive here/);
  await expect(input).toHaveAttribute("type", "file");
  await page.keyboard.press("Tab");
  await expect(input).toBeFocused();
  const surface = page.locator("mb-file-drop label").first();
  const box = await surface.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await input.setInputFiles({
    name: "twitter.zip",
    mimeType: "application/zip",
    buffer: Buffer.from("PK"),
  });
  await expect(page.getByTestId("picked")).toHaveText("1 picked: twitter.zip");
  const scroll = await page.evaluate(
    () => document.documentElement.scrollWidth,
  );
  expect(scroll).toBeLessThanOrEqual(320);
});

test("a busy file drop announces its work and takes no files", async ({
  page,
}) => {
  await page.goto(story("file-drop-busy"));
  await expect(page.getByRole("status")).toHaveText(
    "Reading your follows, tweets and likes…",
  );
  await expect(page.locator("input[type=file]")).toBeDisabled();
});

test("progress and stats expose values as text, not only as bars", async ({
  page,
}) => {
  await page.goto(story("progress"));
  const bar = page.getByRole("progressbar", {
    name: "Searching mastodon.social…",
  });
  await expect(bar).toHaveAttribute("max", "3431");
  await page.goto(story("stats"));
  await expect(
    page.getByRole("list", { name: "Posts per year" }).getByRole("listitem"),
  ).toHaveCount(6);
  await expect(page.locator("dl[mbStatGrid] dd").first()).toHaveText("10,486");
});
