import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");

const review =
  "/iframe.html?id=start-here-sprint-2-review--review&viewMode=story";

test("Sprint 2 opens through the Storybook manager", async ({ page }) => {
  await page.goto("/?path=/story/start-here-sprint-2-review--review");
  await expect(
    page
      .frameLocator("#storybook-preview-iframe")
      .getByRole("heading", { name: "Forms that fit together." }),
  ).toBeVisible();
});

test("native fields save, validate and restore the last confirmed value after failure", async ({
  page,
}) => {
  await page.goto(review);
  const name = page.getByRole("textbox", { name: "Display name" });
  await name.fill("Confirmed reader");
  await page.getByRole("button", { name: "Save successfully" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Saved ✓" }),
  ).toBeVisible();
  await name.fill("Unsaved replacement");
  await page.getByRole("button", { name: "Simulate failed save" }).click();
  await expect(name).toHaveValue("Confirmed reader");
  await expect(name).toBeEnabled();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "previous value has been restored" }),
  ).toBeVisible();
  await name.fill("");
  await page.getByRole("button", { name: "Save successfully" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Enter a display name." }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Post visibility" })
    .selectOption({ label: "Followers" });
  await expect(
    page.getByRole("combobox", { name: "Post visibility" }),
  ).toHaveValue("Followers");
  await expect(
    page.getByRole("textbox", { name: "Server address" }),
  ).toBeDisabled();
});

test("radio arrows select within the group and skip unavailable options", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=forms-radio-group--default&viewMode=story");
  const first = page.getByRole("radio", {
    name: "Keep warnings collapsed",
    exact: true,
  });
  const second = page.getByRole("radio", {
    name: "Expand posts from people I follow",
    exact: true,
  });
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await expect(second).toBeChecked();
  await expect(first).not.toBeChecked();
  await page.goto(
    "/iframe.html?id=forms-radio-group--unavailable-option&viewMode=story",
  );
  await expect(
    page.getByRole("radio", { name: "Managed by your server" }),
  ).toBeDisabled();
  await page
    .getByRole("radio", { name: "Keep warnings collapsed", exact: true })
    .focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("radio", { name: "Managed by your server" }),
  ).not.toBeChecked();
});

for (const [theme, width, direction] of [
  ["light", 1280, "ltr"],
  ["dark", 380, "ltr"],
  ["light", 380, "rtl"],
]) {
  test(`Sprint 2 layout ${theme} ${width}px ${direction}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${review}&globals=theme:${theme};direction:${direction}`);
    await expect(
      page.getByRole("heading", { name: "Forms that fit together." }),
    ).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("dir", direction);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const option = page.locator("mb-radio-group .choice").last();
    const label = await option.locator("label").boundingBox();
    const hint = await option.locator("p").boundingBox();
    expect(label).not.toBeNull();
    expect(hint).not.toBeNull();
    const labelEdge = direction === "rtl" ? label.x + label.width : label.x;
    const hintEdge = direction === "rtl" ? hint.x + hint.width : hint.x;
    expect(Math.abs(labelEdge - hintEdge)).toBeLessThan(1);
    await page.screenshot({
      path: testInfo.outputPath("forms-review.png"),
      fullPage: true,
    });
  });
}

for (const theme of ["light", "dark"]) {
  for (const accent of [
    "blue",
    "yellow",
    "rose",
    "purple",
    "orange",
    "green",
  ]) {
    test(`form text contrast ${theme}/${accent}`, async ({
      page,
    }, testInfo) => {
      await page.goto(`${review}&globals=theme:${theme};accent:${accent}`);
      await expect(
        page.getByRole("heading", { name: "Forms that fit together." }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Simulate failed save" }).click();
      await expect(
        page
          .getByRole("alert")
          .filter({ hasText: "previous value has been restored" }),
      ).toBeVisible();
      const pairs = await page.evaluate(() => {
        const parse = (color) => {
          const parts = color.match(/[\d.]+/g)?.map(Number);
          if (!parts || (parts.length === 4 && parts[3] !== 1))
            throw new Error(`Expected opaque computed color: ${color}`);
          return parts.slice(0, 3);
        };
        const luminance = (rgb) =>
          rgb
            .map((n) => n / 255)
            .map((n) =>
              n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4,
            )
            .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
        return [
          ...document.querySelectorAll(
            'mb-field .mb-field-label, mb-field .mb-field-hint, mb-field .mb-control, mb-radio-group label, mb-radio-group .copy p, mb-save-feedback [role="alert"]',
          ),
        ]
          .filter((element) => element.getBoundingClientRect().height > 0)
          .map((element) => {
            const foreground = getComputedStyle(element).color;
            let parent = element;
            let background = getComputedStyle(parent).backgroundColor;
            while (background === "rgba(0, 0, 0, 0)" && parent.parentElement) {
              parent = parent.parentElement;
              background = getComputedStyle(parent).backgroundColor;
            }
            const fg = luminance(parse(foreground));
            const bg = luminance(parse(background));
            return {
              text:
                element.textContent.trim().slice(0, 80) ||
                element.getAttribute("type"),
              foreground,
              background,
              ratio: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
            };
          });
      });
      expect(pairs.length).toBeGreaterThan(10);
      for (const pair of pairs)
        expect(pair.ratio, JSON.stringify(pair)).toBeGreaterThanOrEqual(7);
      await testInfo.attach("computed-contrast-pairs", {
        body: JSON.stringify({ theme, accent, pairs }, null, 2),
        contentType: "application/json",
      });
      await writeFile(
        testInfo.outputPath("contrast.json"),
        JSON.stringify({ theme, accent, pairs }, null, 2),
      );
    });
  }
}
