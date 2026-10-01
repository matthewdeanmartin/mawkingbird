import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const review =
  "/iframe.html?id=start-here-sprint-3-review--review&viewMode=story";

for (const theme of ["light", "dark"]) {
  for (const accent of [
    "blue",
    "yellow",
    "rose",
    "purple",
    "orange",
    "green",
  ]) {
    test(`toolbar and navigation contrast ${theme}/${accent}`, async ({
      page,
    }) => {
      await page.goto(`${review}&globals=theme:${theme};accent:${accent}`);
      await expect(
        page.getByRole("heading", { name: "Actions belong together." }),
      ).toBeVisible();
      const pairs = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 1;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        const luminance = (color) => {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = color;
          context.fillRect(0, 0, 1, 1);
          const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3);
          return rgb
            .map((v) => v / 255)
            .map((v) =>
              v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
            )
            .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
        };
        return [
          ...document.querySelectorAll(
            'button[mbToolbarButton], a[mbNavLink], [role="tab"], mb-page-header h2, mb-page-header p',
          ),
        ].map((element) => {
          let surface = element;
          while (
            getComputedStyle(surface).backgroundColor === "rgba(0, 0, 0, 0)" &&
            surface.parentElement
          )
            surface = surface.parentElement;
          const foreground = luminance(getComputedStyle(element).color);
          const background = luminance(
            getComputedStyle(surface).backgroundColor,
          );
          return {
            text: element.textContent.trim(),
            ratio:
              (Math.max(foreground, background) + 0.05) /
              (Math.min(foreground, background) + 0.05),
          };
        });
      });
      expect(pairs.length).toBeGreaterThan(10);
      for (const pair of pairs)
        expect(pair.ratio, JSON.stringify(pair)).toBeGreaterThanOrEqual(7);
    });
  }
}

test("Sprint 3 opens in the manager", async ({ page }) => {
  await page.goto("/?path=/story/start-here-sprint-3-review--review");
  await expect(
    page
      .frameLocator("#storybook-preview-iframe")
      .getByRole("heading", { name: "Actions belong together." }),
  ).toBeVisible();
});

for (const direction of ["ltr", "rtl"]) {
  test(`toolbar keyboard contract ${direction}`, async ({ page }) => {
    await page.goto(`${review}&globals=direction:${direction}`);
    const toolbar = page.getByRole("toolbar", { name: "Home feed controls" });
    const boosts = toolbar.getByRole("button", { name: "Boosts" });
    const refresh = toolbar.getByRole("button", { name: "Refresh feed" });
    await expect(toolbar.locator('[tabindex="0"]')).toHaveCount(1);
    await boosts.focus();
    await page.keyboard.press(direction === "ltr" ? "ArrowLeft" : "ArrowRight");
    await expect(refresh).toBeFocused();
    await page.keyboard.press(direction === "ltr" ? "ArrowLeft" : "ArrowRight");
    await expect(
      toolbar.getByRole("button", { name: "Calm feed" }),
    ).toBeFocused();
    await expect(boosts).toHaveAttribute("aria-pressed", "true");
    await page.keyboard.press("Home");
    await expect(boosts).toBeFocused();
    await page.keyboard.press("Space");
    await expect(boosts).toHaveAttribute("aria-pressed", "false");
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("status").filter({ hasText: "Feed refreshed 1" }),
    ).toBeVisible();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("tab", { name: "Timeline" })).toBeFocused();
    await expect(boosts).toHaveCSS("border-radius", "5px");
  });
}

test("tabs focus without activation, skip disabled, retain panel state and link names", async ({
  page,
}) => {
  await page.goto(
    "/iframe.html?id=navigation-links-and-tabs--content-tabs&viewMode=story",
  );
  const timeline = page.getByRole("tab", { name: "Timeline" });
  const members = page.getByRole("tab", { name: "Members" });
  await page.getByRole("searchbox").fill("keep this draft");
  await timeline.focus();
  await page.keyboard.press("ArrowRight");
  await expect(members).toBeFocused();
  await expect(timeline).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Space");
  await expect(page.getByRole("tabpanel", { name: "Members" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Analytics" })).toBeFocused();
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("searchbox")).toHaveValue("keep this draft");
  await expect(
    page.getByRole("tabpanel", { name: "Timeline" }),
  ).toHaveAttribute("id", await timeline.getAttribute("aria-controls"));
});

test("navigation keeps native links and current destination", async ({
  page,
}) => {
  await page.goto(review);
  const nav = page.getByRole("navigation", { name: "Settings destinations" });
  const privacy = nav.getByRole("link", { name: "Privacy" });
  await expect(privacy).toHaveAttribute("href", "#privacy-destination");
  await privacy.click();
  await expect(privacy).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("link", { name: "Profile" })).not.toHaveAttribute(
    "aria-current",
  );
  await expect(nav.getByRole("tab")).toHaveCount(0);
});

for (const [theme, width, direction] of [
  ["light", 1280, "ltr"],
  ["dark", 380, "ltr"],
  ["light", 380, "rtl"],
]) {
  test(`Sprint 3 layout ${theme} ${width}px ${direction}`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1100 });
    await page.goto(`${review}&globals=theme:${theme};direction:${direction}`);
    await expect(
      page.getByRole("heading", { name: "Actions belong together." }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("navigation-review.png"),
      fullPage: true,
    });
  });
}

test("touch toolbars provide 44px targets", async ({ browser }) => {
  const context = await browser.newContext({
    hasTouch: true,
    viewport: { width: 380, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:6008${review}`);
  const buttons = page
    .getByRole("toolbar", { name: "Home feed controls" })
    .getByRole("button");
  await expect(buttons).toHaveCount(5);
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThanOrEqual(44);
  }
  await context.close();
});
