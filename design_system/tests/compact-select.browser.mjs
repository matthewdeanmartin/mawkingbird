import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");

for (const [width, theme, direction] of [
  [1280, "light", "ltr"],
  [320, "light", "ltr"],
  [380, "dark", "rtl"],
]) {
  test(`compact feed selects preserve geometry and native keys ${width} ${theme} ${direction}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(
      `/iframe.html?id=forms-field--compact-feed-selects&viewMode=story&globals=theme:${theme};direction:${direction}`,
    );
    const home = page.getByRole("combobox", { name: "Default Home to…" });
    const window = page.getByRole("combobox", { name: "Time window" });
    const regular = page.getByRole("combobox", { name: "Regular form select" });
    await expect(home).toBeVisible();
    const geometry = await page.locator("mb-field").evaluateAll((fields) =>
      fields.map((field) => {
        const select = field.querySelector("select");
        return {
          fieldHeight: field.getBoundingClientRect().height,
          selectHeight: select.getBoundingClientRect().height,
          appearance: getComputedStyle(select).appearance,
          border: getComputedStyle(select).borderTopWidth,
        };
      }),
    );
    expect(geometry[0].fieldHeight).toBe(geometry[1].fieldHeight);
    expect(geometry[0].fieldHeight).toBeLessThan(geometry[2].selectHeight);
    expect(geometry[0].appearance).toBe("none");
    expect(geometry[1].appearance).toBe("none");
    expect(geometry[0].border).toBe("0px");
    expect(geometry[1].border).toBe("0px");
    expect(geometry[2].appearance).not.toBe("none");
    await home.focus();
    await page.keyboard.press("ArrowDown");
    await expect(home).toHaveValue("media");
    await page.keyboard.press("Tab");
    await expect(window).toBeFocused();
    await window.selectOption("today");
    await expect(window).toHaveValue("today");
    await page.keyboard.press("Tab");
    await expect(regular).toBeFocused();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({ path: info.outputPath("compact-selects.png") });
  });
}
