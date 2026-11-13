import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");

for (const width of [1280, 390]) {
  test(`ten pages survive nested Back and Forward at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto(
      "/iframe.html?id=navigation-reading-history--nested-reading&viewMode=story",
    );
    await expect(
      page.getByRole("heading", { name: "Reading history feed" }),
    ).toBeVisible();
    await page.getByLabel("Filter").fill("held filter");
    for (let i = 0; i < 10; i++)
      await page.getByRole("button", { name: "Load more" }).click();
    await expect(page.getByRole("status")).toHaveText("110 loaded posts");
    const row = page.locator('[data-post="95"]');
    await row.scrollIntoViewIfNeeded();
    const top = await row.evaluate(
      (element) => element.getBoundingClientRect().top,
    );
    await row.getByRole("link", { name: "Open discussion 95" }).click();
    await expect(
      page.getByRole("heading", { name: "Discussion 95" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "View profile" }).first().click();
    await expect(
      page.getByRole("heading", { name: "Discussion alice" }),
    ).toBeVisible();
    const back = page.getByRole("button", { name: "Back", exact: true });
    await expect(back).toHaveCount(1);
    await back.click();
    await expect(
      page.getByRole("heading", { name: "Discussion 95" }),
    ).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("status")).toHaveText("110 loaded posts");
    await expect(page.getByLabel("Filter")).toHaveValue("held filter");
    await expect
      .poll(async () =>
        Math.abs(
          (await row.evaluate((el) => el.getBoundingClientRect().top)) - top,
        ),
      )
      .toBeLessThan(3);
    await expect(
      row.getByRole("link", { name: "Open discussion 95" }),
    ).toBeFocused();
    // A late media layout above the anchor must not move the returned reading row.
    await page.locator('[data-post="0"]').evaluate((element) => {
      element.style.minHeight = "450px";
    });
    await expect
      .poll(async () =>
        Math.abs(
          (await row.evaluate((el) => el.getBoundingClientRect().top)) - top,
        ),
      )
      .toBeLessThan(3);
    await page.goForward();
    await expect(
      page.getByRole("heading", { name: "Discussion 95" }),
    ).toBeVisible();
    await back.click();
    await expect(page.getByRole("status")).toHaveText("110 loaded posts");
    await page.getByRole("button", { name: "Load more" }).click();
    await expect(page.getByRole("status")).toHaveText("120 loaded posts");
  });
}
