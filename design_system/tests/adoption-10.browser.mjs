import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const review =
  "/iframe.html?id=start-here-sprint-10-review--app-pages&viewMode=story";
const failures = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  failures.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (event) => {
    if (event.type() === "error") errors.push(event.text());
  });
  await page.goto(review);
  await expect(
    page.getByRole("heading", {
      name: "Navigation and timeline states in real pages.",
    }),
  ).toBeVisible();
});
test.afterEach(async ({ page }) => expect(failures.get(page)).toEqual([]));
const app = (page) => page.getByRole("region", { name: "App page" });
async function response(page, name) {
  // Release a local network fixture without scrolling the app viewport.
  const button = page.getByRole("button", { name, exact: true });
  await expect(button).toBeEnabled();
  await button.evaluate((element) => element.click());
}
test("public page distinguishes loading, failed response, retry and true empty", async ({
  page,
}) => {
  const scope = app(page);
  await expect(scope.getByRole("status")).toHaveText("Loading…");
  await response(page, "Fail request");
  await expect(scope.getByRole("alert")).toHaveText(
    "Could not load posts. Try again.",
  );
  await expect(
    scope.getByText("No public statuses yet.", { exact: true }),
  ).toHaveCount(0);
  await scope.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(scope.getByRole("status")).toHaveText("Loading…");
  await response(page, "Return empty");
  await expect(
    scope.getByText("No public statuses yet.", { exact: true }),
  ).toBeVisible();
  await expect(scope.getByRole("alert")).toHaveCount(0);
});
test("public refresh retains the exact post nodes through loading and failed retry", async ({
  page,
}) => {
  await response(page, "Return posts");
  const scope = app(page);
  const cards = scope.locator("app-status-card");
  await expect(cards).toHaveCount(2);
  await cards
    .first()
    .evaluate((element) => (element.dataset["retained"] = "yes"));
  await scope.getByRole("button", { name: "🔄 More", exact: true }).click();
  await expect(scope.getByRole("status")).toHaveText("Loading…");
  await expect(cards).toHaveCount(2);
  await response(page, "Fail request");
  await expect(scope.getByRole("alert")).toBeVisible();
  await expect(cards.first()).toHaveAttribute("data-retained", "yes");
  await scope.getByRole("button", { name: "Retry", exact: true }).click();
  await response(page, "Return posts");
  await expect(scope.getByRole("alert")).toHaveCount(0);
  await expect(cards.first()).toHaveAttribute("data-retained", "yes");
  await scope.getByRole("button", { name: "Local", exact: true }).click();
  await expect(cards).toHaveCount(0);
  await expect(page.locator("output")).toHaveText(/local=true/);
});
test("list pagination keeps posts mounted, preserves the retry cursor and appends", async ({
  page,
}) => {
  await page.getByRole("link", { name: "List timeline", exact: true }).click();
  await response(page, "Return posts");
  const scope = app(page);
  const cards = scope.locator("app-status-card");
  await expect(cards).toHaveCount(40);
  await cards
    .first()
    .evaluate((element) => (element.dataset["retained"] = "yes"));
  await scope.getByRole("button", { name: "Load more", exact: true }).click();
  const scroll = await page.evaluate(() => scrollY);
  await expect(
    scope.getByRole("button", { name: "Loading…", exact: true }),
  ).toBeDisabled();
  await expect(cards).toHaveCount(40);
  await expect(page.locator("output")).toHaveText(/max_id=61/);
  await response(page, "Fail request");
  await expect(scope.getByRole("alert")).toBeAttached();
  expect(
    await scope
      .locator('mb-content-state[kind="error"]')
      .evaluate((element) => {
        const cards = element.parentElement.querySelectorAll("app-status-card");
        return Boolean(
          cards[cards.length - 1].compareDocumentPosition(element) &
          Node.DOCUMENT_POSITION_FOLLOWING,
        );
      }),
  ).toBe(true);
  await expect(cards).toHaveCount(40);
  await expect(cards.first()).toHaveAttribute("data-retained", "yes");
  expect(await page.evaluate(() => scrollY)).toBeGreaterThan(scroll - 150);
  await scope.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator("output")).toHaveText(/max_id=61/);
  await response(page, "Return posts");
  await expect(cards).toHaveCount(42);
  await expect(cards.first()).toHaveAttribute("data-retained", "yes");
  await expect(
    scope.getByRole("button", { name: "Load more", exact: true }),
  ).toHaveCount(0);
});
test("list initial failure recovers to an empty state and preserves member navigation", async ({
  page,
}) => {
  await page.getByRole("link", { name: "List timeline", exact: true }).click();
  const scope = app(page);
  await response(page, "Fail request");
  await expect(scope.getByRole("alert")).toHaveText(
    "Could not load posts. Try again.",
  );
  await expect(
    scope.getByText("No statuses in this list yet.", { exact: true }),
  ).toHaveCount(0);
  await scope.getByRole("button", { name: "Retry", exact: true }).click();
  await response(page, "Return empty");
  await expect(
    scope.getByText("No statuses in this list yet.", { exact: true }),
  ).toBeVisible();
  await scope.getByRole("button", { name: "Members", exact: true }).click();
  await expect(scope.locator("mb-content-state")).toHaveText(
    /No members in this list yet/,
  );
});
test("settings links keep hrefs, cross-listed current destinations and browser history", async ({
  page,
}) => {
  await page
    .getByRole("link", { name: "Settings navigation", exact: true })
    .click();
  const nav = page.getByRole("navigation", { name: "Settings sections" });
  await expect(page).toHaveURL(/#\/settings\/writing\?review=morning/);
  await expect(
    nav.getByRole("link", { name: "Writing", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const privacy = nav.getByRole("link", { name: "Privacy", exact: true });
  await expect(privacy).toHaveCount(2);
  await expect(privacy.first()).toHaveAttribute("href", "#/settings/privacy");
  await privacy.first().click();
  for (const link of await privacy.all())
    await expect(link).toHaveAttribute("aria-current", "page");
  await expect(
    nav.getByRole("link", { name: "Writing", exact: true }),
  ).not.toHaveAttribute("aria-current", "page");
  await page.goBack();
  await expect(page).toHaveURL(/#\/settings\/writing\?review=morning/);
  await expect(
    nav.getByRole("link", { name: "Writing", exact: true }),
  ).toHaveAttribute("aria-current", "page");
  await page.goForward();
  await expect(privacy.first()).toHaveAttribute("aria-current", "page");
});
for (const [theme, width, direction] of [
  ["light", 1280, "ltr"],
  ["dark", 380, "ltr"],
  ["light", 380, "rtl"],
]) {
  test(`adopted navigation and states ${theme} ${width} ${direction}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${review}&globals=theme:${theme};direction:${direction}`);
    await page
      .getByRole("link", { name: "List timeline", exact: true })
      .click();
    await response(page, "Fail request");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator("html")).toHaveAttribute("dir", direction);
    await expect(
      app(page).getByRole("heading", { name: /Research reading list/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("list-error.png"),
      fullPage: true,
    });
    await page
      .getByRole("link", { name: "Settings navigation", exact: true })
      .click();
    if (width < 600) {
      const trigger = page.getByRole("button", {
        name: "Open settings menu",
        exact: true,
      });
      await trigger.click();
      await expect(trigger).toHaveAttribute("aria-expanded", "true");
      await expect(
        page.getByRole("dialog", { name: "Settings", exact: true }),
      ).toBeVisible();
    }
    const nav = page.getByRole("navigation", { name: "Settings sections" });
    await expect(
      nav.getByRole("link", { name: "Internationalization", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("settings.png"),
      fullPage: true,
    });
    if (width < 600) {
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("dialog", { name: "Settings", exact: true }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Open settings menu", exact: true }),
      ).toBeFocused();
    }
  });
}
