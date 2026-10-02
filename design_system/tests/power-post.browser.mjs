import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const url =
  "/iframe.html?id=start-here-sprint-6-review--millions&viewMode=story";
const errors = new WeakMap();
const textLineCount = (element) => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const tops = new Set();
  while (walker.nextNode()) {
    if (!walker.currentNode.textContent.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(walker.currentNode);
    for (const rect of range.getClientRects()) tops.add(Math.round(rect.top));
  }
  return tops.size;
};
test.beforeEach(async ({ page }) => {
  const list = [];
  errors.set(page, list);
  page.on("pageerror", (e) => list.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") list.push(e.text());
  });
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
test("count geometry distinguishes nested inline boxes from wrapped text", async ({
  page,
}) => {
  await page.setContent(`
    <span id="nested"><span>12,345,678</span></span>
    <span id="wrapped" style="display:inline-block;width:3ch;font:16px monospace;white-space:normal">123 456 789</span>
  `);
  expect(await page.locator("#nested").evaluate(textLineCount)).toBe(1);
  expect(await page.locator("#wrapped").evaluate(textLineCount)).toBe(3);
});
for (const [theme, width, direction, touch] of [
  ["light", 1280, "ltr", false],
  ["dark", 380, "ltr", false],
  ["light", 320, "rtl", false],
  ["dark", 380, "ltr", true],
]) {
  test(`full post ${theme} ${width} ${direction} touch=${touch}`, async ({
    browser,
    baseURL,
  }, info) => {
    const context = await browser.newContext({
      baseURL,
      viewport: { width, height: 1000 },
      hasTouch: touch,
      reducedMotion: "reduce",
    });
    try {
      const page = await context.newPage();
      const failures = [];
      page.on("pageerror", (e) => failures.push(e.message));
      await page.goto(`${url}&globals=theme:${theme};direction:${direction}`);
      const group = page.getByRole("group", { name: "All post tools" });
      await expect(group).toBeVisible();
      const tools = group.locator("button, a");
      await expect(tools).toHaveCount(21);
      const bounds = await group.boundingBox();
      const boxes = [];
      for (const tool of await tools.all()) {
        await expect(tool).toBeVisible();
        const box = await tool.boundingBox();
        boxes.push(box);
        expect(box.x).toBeGreaterThanOrEqual(bounds.x - 1);
        expect(box.x + box.width).toBeLessThanOrEqual(
          bounds.x + bounds.width + 1,
        );
        expect(await tool.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(
          true,
        );
        if (touch) {
          expect(box.height).toBeGreaterThanOrEqual(44);
          expect(box.width).toBeGreaterThanOrEqual(44);
        }
      }
      for (let i = 0; i < boxes.length; i++)
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i],
            b = boxes[j];
          expect(
            a.x + a.width <= b.x + 1 ||
              b.x + b.width <= a.x + 1 ||
              a.y + a.height <= b.y + 1 ||
              b.y + b.height <= a.y + 1,
          ).toBe(true);
        }
      for (const count of await group.locator("[mbActionCount]").all()) {
        expect(await count.evaluate(textLineCount)).toBe(1);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await expect(group).toContainText("12,345,678");
      await expect(group).toContainText("9,999,999");
      await page.screenshot({
        path: info.outputPath("full-post.png"),
        fullPage: true,
      });
      expect(failures).toEqual([]);
    } finally {
      await context.close();
    }
  });
}
test("native Tab order reaches every action; counts and links keep their meaning", async ({
  page,
}) => {
  await page.goto(url);
  const group = page.getByRole("group", { name: "All post tools" });
  const tools = group.locator("button:not(:disabled),a");
  await tools.first().focus();
  for (let i = 0; i < (await tools.count()); i++) {
    await expect(tools.nth(i)).toBeFocused();
    await page.keyboard.press("Tab");
  }
  const like = group.getByRole("button", { name: "☆ Like", exact: true });
  await like.focus();
  await page.keyboard.press("Space");
  await expect(like).toHaveAttribute("aria-pressed", "true");
  await expect(
    group.getByRole("link", { name: "Thread reader" }),
  ).toHaveAttribute("href", "#power-thread");
  await group.getByRole("button", { name: "12,345,678 likes" }).click();
  await expect(page.getByRole("status")).toContainText("Liked by");
});
