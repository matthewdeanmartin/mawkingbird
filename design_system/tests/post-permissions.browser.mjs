import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
test("post permissions use shared controls, preserve cancellation and published audience at narrow width", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "/iframe.html?id=adoption-post-permissions--shared-dialog&viewMode=story",
  );
  const trigger = page.getByRole("button", {
    name: "Draft permissions",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const cancelBox = await dialog
    .locator("footer")
    .getByRole("button", { name: "Cancel", exact: true })
    .boundingBox();
  const applyBox = await dialog
    .getByRole("button", { name: "Apply", exact: true })
    .boundingBox();
  expect(applyBox.x - (cancelBox.x + cancelBox.width)).toBeGreaterThanOrEqual(
    8,
  );
  await page.screenshot({ path: ".test-results/permissions-mobile.png" });
  await dialog
    .getByLabel("Public timelines and discovery", { exact: true })
    .selectOption({ label: "Keep out of public timelines (unlisted)" });
  await dialog
    .getByLabel("Who can quote this?", { exact: true })
    .selectOption("nobody");
  await dialog
    .getByLabel("Thread notifications for me", { exact: true })
    .selectOption({ label: "Off" });
  await dialog.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.locator("[data-result]")).toHaveText(
    "unlisted / nobody / true",
  );
  await expect(trigger).toBeFocused();
  await page
    .getByRole("button", { name: "Published permissions", exact: true })
    .click();
  await expect(
    dialog.getByLabel("Who can read this?", { exact: true }),
  ).toBeDisabled();
  await expect(
    dialog.getByLabel("Public timelines and discovery", { exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("[data-result]")).toHaveText(
    "unlisted / nobody / true",
  );
});

test("mini composer keeps permissions in the compact tool row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/iframe.html?id=adoption-composer--compact&viewMode=story");
  const button = page.getByRole("button", {
    name: "Post permissions",
    exact: true,
  });
  await expect(button).toBeVisible();
  await expect(
    page
      .locator("mb-post-actions")
      .getByRole("button", { name: "Post permissions", exact: true }),
  ).toHaveCount(1);
  const box = await button.boundingBox();
  expect(box.width).toBeLessThanOrEqual(48);
  expect(box.height).toBeLessThanOrEqual(48);
  await page.screenshot({ path: ".test-results/composer-mobile.png" });
  await button.click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("notification dismissal follows compact inline actions on a phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "/iframe.html?id=adoption-notification-layout--compact-actions&viewMode=story",
  );
  const buttons = page.getByRole("button", {
    name: "Hide notification",
    exact: true,
  });
  await expect(buttons).toHaveCount(4);
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    expect(box.height).toBeLessThanOrEqual(40);
    expect(box.width).toBeLessThan(180);
    await expect(button.locator("..")).toHaveClass("mention-actions");
  }
  await page.screenshot({
    path: ".test-results/notifications-mobile.png",
    fullPage: true,
  });
});

test("mutual post tint uses the current theme background", async ({ page }) => {
  await page.goto(
    "/iframe.html?id=start-here-sprint-11-review--provider-tools&viewMode=story",
  );
  await page.getByRole("button", { name: "Mutual", exact: true }).click();
  const post = page.locator("article.status");
  await expect(post).toHaveClass(/mutual/);
  const color = await post.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  expect(color).not.toBe("rgba(0, 0, 0, 0)");
  await page.screenshot({ path: ".test-results/mutual-post.png" });
});
