import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");

test("help is compact, keyboard accessible, and dismisses without parent actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/iframe.html?id=feedback-help--default&viewMode=story");
  const trigger = page.getByRole("button", { name: "About YouTube playback" });
  const help = page.getByRole("dialog", { name: "About YouTube playback" });
  await expect(help).toBeHidden();
  await trigger.focus();
  await trigger.press("Enter");
  await expect(help).toBeVisible();
  await expect(help).toBeFocused();
  await expect(help).toContainText("doesn't transfer between views");
  const box = await help.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  await help.press("Escape");
  await expect(help).toBeHidden();
  await expect(trigger).toBeFocused();
  await trigger.press("Space");
  await expect(help).toBeVisible();
  await page.mouse.click(310, 600);
  await expect(help).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
});
