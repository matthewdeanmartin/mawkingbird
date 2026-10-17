import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
for (const theme of ["light", "dark"]) {
  test(`report section and help typography match settings in ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(
      `/iframe.html?id=start-here-sprint-15-review--privacy-and-trust&viewMode=story&globals=theme:${theme}`,
    );
    const reports = page.locator("app-report-history h2");
    const counts = page.getByRole("heading", {
      name: "What this app counts",
      exact: true,
    });
    await reports.scrollIntoViewIfNeeded();
    expect((await reports.boundingBox()).x).toBe(
      (await counts.boundingBox()).x,
    );
    const typography = (el) => {
      const style = getComputedStyle(el);
      return [style.fontSize, style.fontWeight];
    };
    expect(await reports.evaluate(typography)).toEqual(
      await counts.evaluate(typography),
    );
    await page
      .getByRole("button", { name: "About report history", exact: true })
      .click();
    const help = page.locator("[popover]:popover-open");
    await expect(help).toBeVisible();
    expect(await help.evaluate(typography)).toEqual(["14px", "400"]);
    await page.screenshot({ path: info.outputPath("report-help.png") });
  });
}
test("My tags is a toggle beside visual views and Reader cannot remain selected with them", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "/iframe.html?id=adoption-sprint-3-toolbars--app-controls&viewMode=story",
  );
  const reader = page.getByRole("button", { name: "📖 Reader", exact: true });
  const tags = page.getByRole("button", { name: "# My tags", exact: true });
  await tags.click();
  await expect(tags).toHaveAttribute("aria-pressed", "true");
  for (const label of ["🖼️ Media", "🎬 Video"]) {
    await reader.click();
    await expect(reader).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(reader).toHaveAttribute("aria-pressed", "false");
    await expect(tags).toHaveAttribute("aria-pressed", "true");
  }
  await page.screenshot({ path: info.outputPath("feed-controls.png") });
});
test("hovering the author loads Following before the popup is entered", async ({
  page,
}, info) => {
  await page.goto(
    "/iframe.html?id=start-here-sprint-11-review--provider-tools&viewMode=story",
  );
  await page.getByRole("button", { name: "Mutual", exact: true }).click();
  const author = page.locator("app-status-card .name").first();
  await author.hover();
  const card = author.locator("..").locator("app-account-hover-card");
  await expect(
    card.getByRole("button", { name: "Following", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("hover-following.png") });
});

for (const appTheme of ["light", "dark"]) {
  test(`reader papers and mutual tint retain contrast in the ${appTheme} app`, async ({
    page,
  }, info) => {
    await page.goto(
      `/iframe.html?id=start-here-sprint-11-review--provider-tools&viewMode=story&globals=theme:${appTheme}`,
    );
    await page.getByRole("button", { name: "Reader", exact: true }).click();
    const post = page.locator("article.status");
    const paper = page.getByLabel("Article theme", { exact: true });
    const colors = async () =>
      post.evaluate((el) => {
        const style = getComputedStyle(el);
        const ctx = document.createElement("canvas").getContext("2d");
        const rgb = (color) => {
          ctx.fillStyle = color;
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
        };
        return { bg: rgb(style.backgroundColor), fg: rgb(style.color) };
      });
    const lum = (rgb) =>
      rgb
        .map((c) => c / 255)
        .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    for (const [theme, expected] of [
      ["app", null],
      ["light", [255, 255, 255]],
      ["sepia", [244, 236, 216]],
      ["dark", [22, 24, 28]],
      ["solarized", [253, 246, 227]],
    ]) {
      await page
        .getByRole("button", { name: "Signed in", exact: true })
        .click();
      await paper.selectOption(theme);
      await expect(post).toHaveAttribute("data-reader-paper", theme);
      const normal = await colors();
      if (expected) expect(normal.bg).toEqual(expected);
      await page.getByRole("button", { name: "Mutual", exact: true }).click();
      await expect(post).toHaveClass(/mutual/);
      const mutual = await colors();
      expect(mutual.bg).not.toEqual(normal.bg);
      const a = lum(mutual.bg),
        b = lum(mutual.fg);
      expect(
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05),
      ).toBeGreaterThanOrEqual(4.5);
      await page.screenshot({ path: info.outputPath(`${theme}-mutual.png`) });
    }
    await page.getByRole("button", { name: "Reader", exact: true }).click();
    await expect(post).not.toHaveAttribute("data-reader-paper");
    expect(await page.locator("html").getAttribute("data-theme")).toBe(
      appTheme,
    );
  });
}
