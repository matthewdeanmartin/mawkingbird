import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const url = "/iframe.html?id=adoption-reader-controls--reading&viewMode=story";

for (const [width, direction, theme] of [
  [320, "ltr", "light"],
  [412, "rtl", "dark"],
  [1280, "ltr", "light"],
]) {
  test(`reader foundation preserves native fields and navigation ${width} ${direction}`, async ({
    browser,
    baseURL,
  }, info) => {
    const context = await browser.newContext({
      baseURL,
      viewport: { width, height: 1000 },
      hasTouch: width < 500,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(
      `${url}&globals=direction:${direction};theme:${theme};accent:purple`,
    );
    const toolbar = page.getByRole("toolbar", {
      name: "Reader controls",
      exact: true,
    });
    await expect(toolbar).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const layouts = {};
    const capture = async (name) => {
      await page.evaluate(() => window.scrollTo(0, 0));
      layouts[name] = await page
        .locator(
          ".read-toolbar, .typography, .typo-row, .typo-label, .typo-value, .typo-row select, .typo-row input, .search-dialog, .search-field, .search-result, .search-context, .search-page, .library, .rail-row, .notes-rail",
        )
        .evaluateAll((elements) =>
          elements
            .filter((element) => element.getClientRects().length)
            .map((element) => {
              const box = element.getBoundingClientRect();
              const style = getComputedStyle(element);
              return {
                tag: element.tagName,
                class: element.className,
                box: [box.x, box.y, box.width, box.height],
                color: style.color,
                background: style.backgroundColor,
                font: style.font,
                lineHeight: style.lineHeight,
                padding: style.padding,
                border: style.border,
                radius: style.borderRadius,
                shadow: style.boxShadow,
                display: style.display,
                align: style.alignItems,
                gap: style.gap,
              };
            }),
        );
      await page.screenshot({
        path: info.outputPath(`${name}.png`),
        fullPage: true,
        animations: "disabled",
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    };
    await capture("closed");
    await toolbar.getByRole("button", { name: "Text", exact: true }).click();
    const preferences = toolbar.locator("[mbReaderPreferences]");
    await expect(preferences).toHaveCSS("border-radius", "8px");
    await expect(preferences.locator(".typo-row").first()).toHaveCSS(
      "gap",
      "8px",
    );
    await expect(preferences.locator(".typo-label").first()).toHaveCSS(
      "font-size",
      "13px",
    );
    const typeface = toolbar.getByRole("combobox", {
      name: "Typeface",
      exact: true,
    });
    await expect(typeface).toHaveJSProperty("tagName", "SELECT");
    await expect(typeface).toHaveCSS("font-size", "13px");
    await typeface.selectOption("mono");
    await expect(typeface).toHaveValue("mono");
    const range = toolbar.getByRole("slider");
    await range.fill("1.8");
    await expect(range).toHaveValue("1.8");
    await expect(toolbar.locator(".typo-value").last()).toHaveText("1.8");
    await capture("typography");
    await toolbar
      .getByRole("combobox", { name: "Dictionary", exact: true })
      .selectOption("custom");
    const address = toolbar.locator('input[type="url"]');
    await address.fill("not a dictionary");
    await address.press("Tab");
    await expect(address).toHaveAttribute("aria-invalid", "true");
    await expect(address).toHaveCSS("padding", "5px 7px");
    await expect(address).toHaveCSS("border-radius", "5px");
    await capture("invalid-dictionary");
    await address.fill("https://example.com/define/{word}");
    await address.press("Tab");
    await expect(address).not.toHaveAttribute("aria-invalid", "true");
    await toolbar.getByRole("button", { name: "Done", exact: true }).click();
    await toolbar.getByRole("button", { name: "Find", exact: true }).click();
    const search = page.getByRole("dialog");
    await expect(search).toHaveAttribute("mbReaderSearch", "");
    await expect(search).toHaveCSS("border-radius", "8px");
    await expect(search.getByRole("searchbox")).toHaveCSS("padding", "6px 8px");
    await search.getByRole("searchbox").fill("quiet");
    await expect(search.locator(".search-result")).toHaveCount(2);
    await expect(search.locator(".search-result mark").first()).toHaveText(
      "quiet",
    );
    await expect(search.locator(".search-result.on-this-page")).toHaveCount(1);
    await expect(search.locator(".search-result").first()).toHaveCSS(
      "font-size",
      "13px",
    );
    await expect(search.locator(".search-result").first()).toHaveCSS(
      "padding",
      "6px 8px",
    );
    await capture("find");
    await search.getByRole("searchbox").press("Escape");
    await expect(search).toHaveCount(0);
    await toolbar.getByRole("button", { name: "Library", exact: true }).click();
    const library = page.locator("app-library-panel");
    await expect(library.locator("[mbReaderLibrary]")).toHaveCSS(
      "border-radius",
      "12px",
    );
    await expect(library.locator("[mbReaderLibrary]")).toHaveCSS(
      "font-size",
      "14px",
    );
    const link = library.getByRole("link");
    await expect(link).toHaveAttribute("aria-current", "true");
    await expect(link).toHaveCSS("padding", "8px 14px 8px 26px");
    await expect(link).toHaveCSS("font-weight", "700");
    await expect(link).toHaveAttribute("href", /read\/preview-document/);
    await capture("library");
    await library
      .getByRole("button", {
        name: "Options for A quiet reading session",
        exact: true,
      })
      .focus();
    await page.keyboard.press("Enter");
    await expect(library.locator(".row-menu")).toBeVisible();
    await capture("library-menu");
    await library
      .locator(".row-menu")
      .getByRole("button", { name: "Read", exact: true })
      .click();
    await expect(link).toContainText("Filed by hand");
    const shelf = library.getByRole("button", { name: /^Read 1$/ });
    await shelf.click();
    await expect(shelf).toHaveAttribute("aria-expanded", "false");
    await expect(link).toHaveCount(0);
    await shelf.click();
    await expect(link).toBeVisible();
    await writeFile(
      info.outputPath("layout.json"),
      JSON.stringify(layouts, null, 2),
    );
    expect(errors).toEqual([]);
    await context.close();
  });
}
