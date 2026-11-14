import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");

for (const width of [390, 1280]) {
  test(`chat menu and deliberate moderation at ${width}px`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(
      "/iframe.html?id=adoption-chat--conversation&viewMode=story&globals=theme:dark",
    );
    await expect(page.getByLabel("Chat with", { exact: true })).toBeVisible();
    await page.locator(".conv-row").filter({ hasText: "alice" }).click();
    const bubble = page.locator(".bubble").filter({ hasText: "Hello there!" });
    const emoji = bubble.getByRole("button", {
      name: "React with emoji",
      exact: true,
    });
    await bubble.hover();
    expect(
      await emoji.evaluate((button) =>
        button.previousElementSibling?.getAttribute("aria-label"),
      ),
    ).toBe("Like");
    await emoji.click();
    const picker = page.getByRole("dialog", {
      name: "React with emoji",
      exact: true,
    });
    await expect(picker).toBeVisible();
    await expect(
      picker
        .locator("em-emoji-picker")
        .getByRole("button", { name: "😀", exact: true })
        .first(),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(emoji).toBeFocused();
    await emoji.click();
    await picker
      .locator("em-emoji-picker")
      .getByRole("button", { name: "😀", exact: true })
      .first()
      .click();
    await expect(picker).not.toBeVisible();
    const reaction = bubble.getByRole("button", { name: "Reaction 😀: 1" });
    await expect(reaction).toHaveAttribute("aria-pressed", "true");
    await expect(bubble.locator(".reaction-chip")).toHaveText("😀 1");
    await expect(bubble.locator("a.reaction-chip")).toHaveCount(0);
    await reaction.click();
    await expect(bubble.locator(".reaction-chip")).toHaveCount(0);
    await expect(page.locator(".bubble")).toHaveCount(1);
    await page.locator(".chat-head mb-post-menu button").first().click();
    const rows = page.locator(".chat-head [mbMenuItem]:visible");
    const styles = await rows.evaluateAll((elements) =>
      elements.map((element) => {
        const style = getComputedStyle(element);
        const bounds = element.getBoundingClientRect();
        return {
          size: style.fontSize,
          weight: style.fontWeight,
          x: bounds.x,
          y: bounds.y,
        };
      }),
    );
    expect(new Set(styles.map((s) => s.size)).size).toBe(1);
    expect(new Set(styles.map((s) => s.weight)).size).toBe(1);
    expect(new Set(styles.map((s) => s.x)).size).toBe(1);
    expect(
      styles.every((s, index) => index === 0 || s.y > styles[index - 1].y),
    ).toBe(true);
    await page.getByRole("button", { name: "Moderate…", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("combobox")).toHaveValue("0: 3600");
    await expect(
      dialog.getByRole("button", { name: "Block", exact: true }),
    ).toHaveAttribute("data-tone", "danger");
    await expect(
      dialog.getByRole("button", { name: "Report", exact: true }),
    ).toHaveAttribute("data-tone", "danger");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.locator(".private-chat-shortcut").getByRole("button").click();
    await expect(page.locator(".compose-kind")).toContainText("Private");
    await expect(page.getByLabel("Chat with", { exact: true })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(errors).toEqual([]);
  });
}
