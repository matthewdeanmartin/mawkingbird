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
