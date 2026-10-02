import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const url = "/iframe.html?id=adoption-reader-controls--reading&viewMode=story";
for (const [width, direction, touch] of [
  [320, "ltr", true],
  [412, "rtl", true],
  [1280, "ltr", false],
]) {
  test(`reader controls retain paging, find, notes and library at ${width} ${direction}`, async ({
    browser,
    baseURL,
  }, info) => {
    const context = await browser.newContext({
      baseURL,
      viewport: { width, height: 1000 },
      hasTouch: touch,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.goto(
      `${url}&globals=direction:${direction};theme:${direction === "rtl" ? "dark" : "light"};accent:purple`,
    );
    await expect(
      page.getByRole("heading", { name: "Reader controls, same reader." }),
    ).toBeVisible();
    const toolbar = page.getByRole("toolbar", {
      name: "Reader controls",
      exact: true,
    });
    await expect(
      toolbar.getByRole("button", { name: "Previous page", exact: true }),
    ).toBeDisabled();
    await toolbar
      .getByRole("button", { name: "Next page", exact: true })
      .click();
    await expect(toolbar.getByRole("status")).toContainText("2 / 3");
    await toolbar.getByRole("button", { name: "Scroll", exact: true }).click();
    await expect(
      toolbar.getByRole("button", { name: "Scroll", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      toolbar.getByRole("button", { name: "Next page", exact: true }),
    ).toHaveCount(0);
    await toolbar.getByRole("button", { name: "Pages", exact: true }).click();
    await toolbar.getByRole("button", { name: "Text", exact: true }).click();
    await expect(
      toolbar.getByRole("combobox", { name: "Typeface", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await toolbar.getByRole("button", { name: "Done", exact: true }).click();
    await toolbar.getByRole("button", { name: "Find", exact: true }).click();
    const search = page.getByRole("dialog");
    await search.getByRole("searchbox").fill("quiet");
    await expect(search.getByRole("status")).toContainText("2");
    await search.getByRole("button", { name: /Another quiet passage/ }).click();
    await expect(search).toHaveCount(0);
    const selection = page.locator("app-selection-tools");
    await selection
      .getByRole("button", { name: "Highlight", exact: true })
      .click();
    await expect(
      selection.getByRole("button", { name: "Remove highlight", exact: true }),
    ).toHaveAttribute("data-active", "true");
    await toolbar.getByRole("button", { name: "Library", exact: true }).click();
    const library = page.locator("app-library-panel");
    await expect(library.getByRole("link")).toHaveAttribute(
      "href",
      /read\/preview-document/,
    );
    await library
      .getByRole("button", { name: "Clear all", exact: true })
      .click();
    await expect(library.getByRole("link")).toHaveCount(1);
    await library
      .getByRole("button", { name: "Keep them", exact: true })
      .click();
    await library.getByRole("button", { name: "Close", exact: true }).click();
    const notes = page.locator("app-notes-rail");
    await expect(
      notes.getByRole("button", { name: "Remove", exact: true }),
    ).toHaveAttribute("data-tone", "danger");
    await notes.getByRole("button", { name: "Edit note", exact: true }).click();
    await expect(page.getByRole("status").last()).toHaveText("Edit requested");
    const controls = await page
      .locator("[mbPostAction]")
      .evaluateAll((elements) =>
        elements
          .filter((el) => el.getClientRects().length)
          .map((el) => ({
            height: el.getBoundingClientRect().height,
            width: el.getBoundingClientRect().width,
          })),
      );
    for (const box of controls) {
      expect(box.height).toBe(28);
      expect(box.width).toBeGreaterThanOrEqual(28);
    }
    const bubble = await selection.locator(".selection-tools").boundingBox();
    for (const button of await selection.getByRole("button").all()) {
      const box = await button.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(bubble.x);
      expect(box.x + box.width).toBeLessThanOrEqual(bubble.x + bubble.width);
      expect(box.y + box.height).toBeLessThanOrEqual(bubble.y + bubble.height);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("reader-controls.png"),
      fullPage: true,
    });
    expect(errors).toEqual([]);
    await context.close();
  });
}
