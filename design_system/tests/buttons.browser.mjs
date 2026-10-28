import { createRequire } from "node:module";

const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");

for (const theme of ["light", "dark"]) {
  for (const accent of [
    "blue",
    "yellow",
    "rose",
    "purple",
    "orange",
    "green",
  ]) {
    test(`button contrast and parity: ${theme}, ${accent}`, async ({
      page,
    }, testInfo) => {
      await page.goto(
        `/iframe.html?id=actions-button--consistency&viewMode=story&globals=theme:${theme};accent:${accent}`,
      );
      await expect(
        page.getByRole("heading", { name: "Actions follow your accent" }),
      ).toBeVisible();
      const solid = page.getByRole("button", {
        name: "Save changes",
        exact: true,
      });
      const legacy = page.getByRole("button", {
        name: "Legacy save",
        exact: true,
      });
      const appearance = (element) => {
        const style = getComputedStyle(element);
        return [
          style.color,
          style.backgroundColor,
          style.borderRadius,
          style.padding,
          style.font,
        ];
      };
      expect(await solid.evaluate(appearance)).toEqual(
        await legacy.evaluate(appearance),
      );
      const controls = page.locator(
        "#storybook-root button, #storybook-root a[mbButton]",
      );
      const contrast = async () => {
        const ratios = await controls.evaluateAll((elements) => {
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 1;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          const luminance = (color) => {
            context.clearRect(0, 0, 1, 1);
            context.fillStyle = color;
            context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data]
              .slice(0, 3)
              .map((channel) => channel / 255)
              .map((channel) =>
                channel <= 0.04045
                  ? channel / 12.92
                  : ((channel + 0.055) / 1.055) ** 2.4,
              )
              .reduce(
                (sum, channel, index) =>
                  sum + channel * [0.2126, 0.7152, 0.0722][index],
                0,
              );
          };
          return elements.map((element) => {
            const style = getComputedStyle(element);
            let background = style.backgroundColor;
            let parent = element.parentElement;
            while (background === "rgba(0, 0, 0, 0)" && parent) {
              background = getComputedStyle(parent).backgroundColor;
              parent = parent.parentElement;
            }
            const foreground = luminance(style.color);
            const surface = luminance(background);
            return {
              label: element.textContent.trim(),
              ratio:
                (Math.max(foreground, surface) + 0.05) /
                (Math.min(foreground, surface) + 0.05),
            };
          });
        });
        for (const { label, ratio } of ratios)
          expect(ratio, label).toBeGreaterThanOrEqual(7);
      };
      await contrast();
      for (const control of await controls.all()) {
        if (await control.isEnabled()) {
          await control.hover();
          await contrast();
        }
      }
      await solid.focus();
      expect(
        await solid.evaluate(
          (element) => getComputedStyle(element).outlineStyle,
        ),
      ).toBe("solid");
      const direction = page.getByRole("radio", { name: "Bluesky → Mastodon" });
      await direction.check();
      await expect(direction).toBeChecked();
      await direction.focus();
      await page.keyboard.press("ArrowUp");
      await expect(
        page.getByRole("radio", { name: "Mastodon → Bluesky" }),
      ).toBeChecked();
      await page.setViewportSize({ width: 320, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath("buttons.png"),
        fullPage: true,
      });
    });
  }
}

test("small actions retain full touch targets", async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 380, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(
    "http://127.0.0.1:6008/iframe.html?id=actions-button--consistency&viewMode=story",
  );
  const small = page.getByRole("button", { name: "Small action", exact: true });
  await expect(small).toBeVisible();
  const bounds = await small.boundingBox();
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  await context.close();
});

test("compact and link buttons are quiet, never pills", async ({ page }) => {
  await page.goto("/iframe.html?id=actions-button--weights&viewMode=story");
  await expect(
    page.getByRole("heading", { name: "Button weights" }),
  ).toBeVisible();
  const look = (element) => {
    const style = getComputedStyle(element);
    return {
      radius: parseFloat(style.borderTopLeftRadius),
      background: style.backgroundColor,
      border: style.borderTopColor,
      padding: style.paddingTop,
      height: element.getBoundingClientRect().height,
      underline: style.textDecorationLine,
    };
  };
  const solid = await page
    .getByRole("button", { name: "Scan", exact: true })
    .evaluate(look);
  const compact = page.getByRole("button", {
    name: "Scan deeper (+10 calls)",
    exact: true,
  });
  const quiet = await compact.evaluate(look);
  expect(quiet.radius).toBeLessThanOrEqual(8);
  expect(quiet.background).toBe("rgba(0, 0, 0, 0)");
  expect(quiet.border).toBe("rgba(0, 0, 0, 0)");
  expect(quiet.height).toBeLessThan(solid.height);
  await compact.hover();
  expect((await compact.evaluate(look)).background).not.toBe(
    "rgba(0, 0, 0, 0)",
  );
  const pressed = await page
    .getByRole("button", { name: "Recent", exact: true })
    .evaluate(look);
  expect(pressed.background).not.toBe("rgba(0, 0, 0, 0)");

  const link = page.getByRole("button", { name: "Clear filters", exact: true });
  const flat = await link.evaluate(look);
  expect(flat.padding).toBe("0px");
  expect(flat.background).toBe("rgba(0, 0, 0, 0)");
  expect(flat.underline).toBe("none");
  await link.hover();
  expect((await link.evaluate(look)).underline).toBe("underline");
  // A link destination and a link action look the same.
  const destination = await page
    .getByRole("link", { name: "Open discussion", exact: true })
    .evaluate(look);
  expect(destination.padding).toBe(flat.padding);
  expect(destination.background).toBe(flat.background);
});

test("compact actions keep touch targets; link actions stay in the line", async ({
  browser,
}) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 380, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(
    "http://127.0.0.1:6008/iframe.html?id=actions-button--weights&viewMode=story",
  );
  const compact = page.getByRole("button", { name: "Recent", exact: true });
  await expect(compact).toBeVisible();
  const bounds = await compact.boundingBox();
  expect(bounds.height).toBeGreaterThanOrEqual(44);
  expect(bounds.width).toBeGreaterThanOrEqual(44);
  const link = await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .boundingBox();
  expect(link.height).toBeLessThan(44);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await context.close();
});
