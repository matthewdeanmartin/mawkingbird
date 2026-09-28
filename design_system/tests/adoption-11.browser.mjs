import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const url =
  "/iframe.html?id=start-here-sprint-11-review--provider-tools&viewMode=story";
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const messages = [];
  errors.set(page, messages);
  page.on("pageerror", (error) => messages.push(error.message));
  page.on("console", (event) => {
    if (event.type() === "error") messages.push(event.text());
  });
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Real post tools, full counts." }),
  ).toBeVisible();
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
const card = (page) => page.getByRole("region", { name: "Real post" });
const choose = (page, name) =>
  page
    .getByRole("toolbar", { name: "Preview account and provider" })
    .getByRole("button", { name, exact: true })
    .click();
test("real favourite retains optimistic, busy, rollback and retry behavior", async ({
  page,
}) => {
  const scope = card(page);
  const action = scope.getByRole("button", { name: "Favourite", exact: true });
  await action.click();
  const pending = scope.getByRole("button", {
    name: "Undo favourite",
    exact: true,
  });
  await expect(pending).toBeDisabled();
  await expect(pending).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Fail action", exact: true }).click();
  await expect(action).toBeEnabled();
  await expect(action).toHaveAttribute("aria-pressed", "false");
  await expect(scope.getByRole("alert")).toBeVisible();
  await action.click();
  await page
    .getByRole("button", { name: "Complete action", exact: true })
    .click();
  await expect(pending).toBeEnabled();
  await expect(pending).toHaveAttribute("aria-pressed", "true");
  await expect(scope.getByRole("alert")).toHaveCount(0);
});
test("full counts open separate account lists and preserve native Tab order", async ({
  page,
}) => {
  const scope = card(page);
  await expect(scope.locator("mb-post-actions")).toHaveAttribute(
    "role",
    "group",
  );
  const reply = scope.getByRole("button", { name: "Reply", exact: true });
  await reply.focus();
  await page.keyboard.press("Tab");
  await expect(
    scope.getByRole("button", { name: "Boost", exact: true }),
  ).toBeFocused();
  await scope
    .getByRole("button", { name: "12345678 Favourited by", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Favourited by");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Close", exact: true })
    .click();
  await scope
    .getByRole("button", { name: "2000000 Boosted by", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Boosted by");
});
test("ownership retains destructive confirmation; cancellation keeps the post", async ({
  page,
}) => {
  await choose(page, "Own post");
  const remove = card(page).getByRole("button", {
    name: "Delete",
    exact: true,
  });
  await remove.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(remove).toBeFocused();
  await expect(card(page).locator("article.status")).toBeVisible();
});
test("provider and anonymous branches retain their capabilities and native destinations", async ({
  page,
}) => {
  const scope = card(page);
  await choose(page, "Anonymous");
  await expect(
    scope.getByRole("button", { name: "Favourite", exact: true }),
  ).toHaveCount(0);
  await expect(scope.locator("a[mbPostAction]")).toHaveAttribute(
    "href",
    /statuses/,
  );
  await scope.getByRole("button", { name: /12345678 favourites/ }).click();
  await expect(scope.getByRole("dialog")).toBeVisible();
  await scope
    .getByRole("dialog")
    .getByRole("button", { name: "Not now", exact: true })
    .click();
  await choose(page, "RSS");
  await expect(
    scope.getByRole("button", { name: "Boost", exact: true }),
  ).toHaveCount(0);
  await expect(
    scope.getByRole("link", { name: /View thread/ }),
  ).toHaveAttribute("href", /reader=0/);
  await expect(
    scope.getByRole("link", { name: /Open original/ }),
  ).toHaveAttribute("href", "https://social.example/@reader/review-post");
  await choose(page, "RSS anonymous");
  await expect(
    scope.getByRole("button", { name: "Save to library", exact: true }),
  ).toHaveAttribute("mbPostAction", "");
  await choose(page, "Twitter");
  await expect(
    scope.getByRole("button", { name: "Favourite", exact: true }),
  ).toHaveCount(0);
  await expect(scope.locator("mb-post-actions")).toContainText(
    "12345678 likes",
  );
  await choose(page, "Bluesky");
  await scope.getByRole("button", { name: "Favourite", exact: true }).click();
  await expect(
    scope.getByRole("button", { name: "Undo favourite", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Complete action", exact: true })
    .click();
  await expect(
    scope.getByRole("button", { name: "Undo favourite", exact: true }),
  ).toBeEnabled();
});
test("unified share remains an opt-in preference", async ({ page }) => {
  const scope = card(page);
  await expect(
    scope.getByRole("button", { name: "Quote", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Unified share preference", exact: true })
    .click();
  await expect(
    scope.getByRole("button", { name: "Quote", exact: true }),
  ).toHaveCount(0);
  await scope.locator('button[aria-haspopup="menu"]').click();
  await expect(
    scope.getByRole("menuitem", { name: "Boost", exact: true }),
  ).toBeFocused();
  await scope.getByRole("menuitem", { name: "Boost", exact: true }).click();
  await page
    .getByRole("button", { name: "Complete action", exact: true })
    .click();
  const trigger = scope.locator('button[aria-haspopup="menu"]');
  await expect(trigger).toHaveAttribute("data-active", "true");
  await expect(trigger).not.toHaveAttribute("aria-pressed");
  expect(
    await trigger.evaluate((button) => getComputedStyle(button).boxShadow),
  ).not.toBe("none");
  await page
    .getByRole("button", { name: "Unified share preference", exact: true })
    .click();
  await expect(
    scope.getByRole("button", { name: "Quote", exact: true }),
  ).toBeVisible();
});
for (const [theme, width, direction, touch] of [
  ["light", 1280, "ltr", false],
  ["dark", 380, "ltr", false],
  ["light", 320, "rtl", false],
  ["dark", 380, "ltr", true],
]) {
  test(`real post tools wrap ${theme} ${width} ${direction} touch=${touch}`, async ({
    browser,
  }, info) => {
    const context = await browser.newContext({
      viewport: { width, height: 1000 },
      hasTouch: touch,
    });
    const page = await context.newPage();
    await page.goto(
      `http://127.0.0.1:6008${url}&globals=theme:${theme};direction:${direction};accent:rose`,
    );
    await choose(page, "Own post");
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator("html")).toHaveAttribute("dir", direction);
    const scope = card(page);
    await expect(scope.locator("mb-post-actions")).toContainText(
      "12345678 favourites",
    );
    const layout = await scope.locator("mb-post-actions").evaluate((group) => {
      const box = group.getBoundingClientRect();
      const controls = [...group.querySelectorAll("[mbPostAction], summary")]
        .filter((el) => el.getClientRects().length)
        .map((el) => {
          const r = el.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            right: r.right,
            bottom: r.bottom,
            h: r.height,
          };
        });
      return {
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
        outside: controls.some(
          (r) => r.x < box.x - 1 || r.right > box.right + 1,
        ),
        overlap: controls.some((a, i) =>
          controls
            .slice(i + 1)
            .some(
              (b) =>
                Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 &&
                Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1,
            ),
        ),
        heights: controls.map((r) => r.h),
      };
    });
    expect(layout.overflow).toBe(false);
    expect(layout.outside).toBe(false);
    expect(layout.overlap).toBe(false);
    expect(Math.min(...layout.heights)).toBeGreaterThanOrEqual(touch ? 44 : 28);
    await scope.screenshot({ path: info.outputPath("post-tools.png") });
    await context.close();
  });
}
test("soft selection follows all six accents in light and dim themes", async ({
  page,
}) => {
  for (const theme of ["light", "dark"]) {
    const colors = [];
    for (const accent of [
      "blue",
      "yellow",
      "rose",
      "purple",
      "orange",
      "green",
    ]) {
      await page.locator("html").evaluate(
        (root, { theme, accent }) => {
          root.dataset.theme = theme;
          root.dataset.accent = accent;
        },
        { theme, accent },
      );
      const selection = page
        .getByRole("toolbar", { name: "Preview account and provider" })
        .getByRole("button", { name: "Signed in", exact: true });
      const result = await selection.evaluate((button) => {
        const probe = document.createElement("span");
        probe.style.backgroundColor = "var(--accent-soft)";
        document.body.append(probe);
        const expected = getComputedStyle(probe).backgroundColor;
        probe.remove();
        return {
          expected,
          actual: getComputedStyle(button).backgroundColor,
          marker: getComputedStyle(button).boxShadow,
        };
      });
      expect(result.actual).toBe(result.expected);
      expect(result.marker).not.toBe("none");
      colors.push(result.actual);
    }
    expect(new Set(colors).size).toBe(6);
  }
});
