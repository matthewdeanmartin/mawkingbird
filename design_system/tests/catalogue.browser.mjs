import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const index = JSON.parse(
  readFileSync(new URL("../dist/index.json", import.meta.url), "utf8"),
);
const stories = Object.values(index.entries).filter(
  (entry) => entry.type === "story",
);
if (!stories.length)
  throw new Error("Build the catalogue before running browser checks.");

test("manager opens the review story in its preview frame", async ({
  page,
}) => {
  await page.goto("/?path=/story/start-here-sprint-1-review--review");
  await expect(
    page.frameLocator("#storybook-preview-iframe").getByRole("heading", {
      name: "Familiar controls. One shared layout.",
    }),
  ).toBeVisible();
});

for (const story of stories) {
  test(`renders ${story.id}`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(`/iframe.html?id=${story.id}&viewMode=story`);
    await expect(page.locator("#storybook-root")).toBeVisible();
    await expect(page.locator("#storybook-root")).toHaveText(/\S/);
    await expect(page.locator(".sb-errordisplay")).not.toBeVisible();
    expect(errors).toEqual([]);
  });
}

for (const [theme, width] of [
  ["light", 1280],
  ["dark", 380],
]) {
  test(`review interaction and layout: ${theme}, ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(
      `/iframe.html?id=start-here-sprint-1-review--review&viewMode=story&globals=theme:${theme}`,
    );
    await expect(
      page.getByRole("heading", {
        name: "Familiar controls. One shared layout.",
      }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const checkbox = page.getByRole("checkbox", {
      name: "Approve new followers",
      exact: true,
    });
    await page.getByText("Approve new followers", { exact: true }).click();
    await expect(checkbox).toBeChecked();
    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(checkbox).not.toBeChecked();
    await expect(
      page.getByRole("checkbox", { name: "Managed by your server" }),
    ).toBeDisabled();

    const longChoice = page
      .locator("mb-checkbox")
      .filter({ hasText: "Show expanded content warnings" });
    const label = await longChoice.locator("label").boundingBox();
    const hint = await longChoice.locator(".hint").boundingBox();
    const input = await longChoice.locator("input").boundingBox();
    expect(label).not.toBeNull();
    expect(hint).not.toBeNull();
    expect(input).not.toBeNull();
    expect(Math.abs(label.x - hint.x)).toBeLessThan(1);
    expect(input.y).toBeGreaterThanOrEqual(label.y);
    expect(input.y).toBeLessThan(label.y + 12);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("review.png"),
      fullPage: true,
    });
  });
}
