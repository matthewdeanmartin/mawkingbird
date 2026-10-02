import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const identity = (mode) =>
  `/iframe.html?id=adoption-navigation-and-identity--${mode}&viewMode=story`;
const servers = (mode) =>
  `/iframe.html?id=adoption-server-selection--${mode}&viewMode=story`;

for (const [width, theme, direction] of [
  [320, "light", "ltr"],
  [412, "dark", "rtl"],
  [1280, "light", "ltr"],
]) {
  test(`identity, follow and rail dialogs ${width} ${theme} ${direction}`, async ({
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
      `${identity("mastodon")}&globals=theme:${theme};direction:${direction};accent:purple`,
    );
    await expect(
      page.getByRole("heading", { name: "Navigation and identity" }),
    ).toBeVisible();
    await expect(page.locator(".suggestion")).toHaveCount(1);
    const stack = page.locator("app-profile-stack");
    await stack
      .getByRole("button", {
        name: "Show Bluesky profile for Another identity",
      })
      .click();
    await expect(stack.locator(".profile-name")).toHaveText("Another identity");
    await expect(stack.locator(".profile-link")).toHaveAttribute(
      "href",
      "https://bsky.app/profile/reader.example",
    );
    await stack
      .getByRole("button", { name: "Show Mastodon profile for A reader" })
      .click();
    await expect(stack.locator(".stat-value")).toContainText("1.2");
    const controls = page.getByRole("region", { name: "Account controls" });
    const preview = controls.locator("app-account-preview");
    await preview
      .getByRole("button", { name: "Preview profile", exact: true })
      .click();
    await expect(preview.locator("[mbAccountCard]")).toBeVisible();
    const request = preview.getByRole("button", {
      name: "Request",
      exact: true,
    });
    await request.click();
    await expect(preview.locator(".hc-follow")).toBeDisabled();
    await expect(
      preview.getByRole("button", { name: "Requested", exact: true }),
    ).toBeEnabled();
    await preview
      .getByRole("button", { name: "Requested", exact: true })
      .press("Escape");
    await expect(preview.locator("[mbAccountCard]")).toHaveCount(0);
    await expect(
      preview.getByRole("button", { name: "Preview profile", exact: true }),
    ).toBeFocused();
    await controls
      .getByRole("button", { name: "Follow @new-person", exact: true })
      .click();
    await expect(
      controls.getByRole("button", {
        name: "Requested @new-person",
        exact: true,
      }),
    ).toBeEnabled();
    await controls.getByRole("button", { name: "Fail next follow" }).click();
    await controls
      .getByRole("button", { name: "Following @following", exact: true })
      .click();
    await expect(controls.getByRole("alert")).toContainText(
      "Couldn't update this follow",
    );
    await expect(
      controls.getByRole("button", {
        name: "Following @following",
        exact: true,
      }),
    ).toBeEnabled();
    await controls
      .getByRole("button", { name: "Following @following", exact: true })
      .click();
    await expect(
      controls.getByRole("button", { name: "Follow @following", exact: true }),
    ).toBeEnabled();
    await expect(controls.getByRole("alert")).toHaveCount(0);
    const rail = page.locator("app-right-rail");
    const toggle = rail.getByRole("checkbox", { name: "Just My Server mode" });
    await toggle.focus();
    await page.keyboard.press("Space");
    await expect(toggle).toBeChecked();
    const update = rail.getByRole("button", {
      name: "Update My Server list",
      exact: true,
    });
    await update.click();
    const updateDialog = page.getByRole("dialog", {
      name: "Update My Server list?",
    });
    await expect(updateDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(updateDialog).toHaveCount(0);
    await expect(update).toBeFocused();
    await update.click();
    await updateDialog
      .getByRole("button", { name: "Update list", exact: true })
      .click();
    await expect(
      updateDialog.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(updateDialog).toBeVisible();
    await expect(updateDialog).toHaveCount(0);
    await expect(rail.locator(".server-mode-status.ok")).toContainText(
      "Added 1",
    );
    const share = rail.getByRole("button", {
      name: "Share this server",
      exact: true,
    });
    const before = page.url();
    await share.click();
    const shareDialog = page.getByRole("dialog", {
      name: "Share this server",
      exact: true,
    });
    const address = shareDialog.getByRole("textbox", {
      name: "Shareable server link",
    });
    await expect(address).toHaveAttribute("readonly", "");
    await expect(address).toHaveValue(/\/anonymous\?home\.example$/);
    expect(page.url()).toBe(before);
    await page.evaluate(() =>
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async () => {
            throw new Error("Preview denied");
          },
        },
      }),
    );
    await shareDialog
      .getByRole("button", { name: "Copy", exact: true })
      .click();
    await expect(shareDialog.getByRole("alert")).toContainText(
      "Couldn't copy automatically",
    );
    await shareDialog
      .getByRole("button", { name: "Close", exact: true })
      .click();
    await expect(share).toBeFocused();
    await expect(
      rail.getByRole("navigation", { name: "Fediverse", exact: true }),
    ).toBeVisible();
    await expect(
      rail.getByRole("link", { name: "All feeds", exact: true }),
    ).toHaveAttribute("href", /\/feeds$/);
    if (width >= 1000) {
      await page.locator(".suggestion .hover-anchor").first().hover();
      await expect(
        page.locator(".suggestion app-account-hover-card").first(),
      ).toBeVisible();
    } else {
      await expect(
        page.locator(".suggestion app-account-hover-card").first(),
      ).not.toBeVisible();
    }
    await page.evaluate(() => scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("identity.png"),
      fullPage: true,
    });
    expect(errors).toEqual([]);
    await context.close();
  });
}

for (const mode of ["anonymous", "bluesky"]) {
  test(`identity provider gates ${mode}`, async ({ page }) => {
    await page.goto(identity(mode));
    const rail = page.locator("app-right-rail");
    await expect(rail.locator(".server-mode-card")).toHaveCount(0);
    if (mode === "anonymous") {
      await expect(page.locator("app-follow-button button")).toHaveCount(0);
      await expect(
        rail.getByRole("link", { name: /Donate.*search\.example/ }),
      ).toBeVisible();
    } else {
      await expect(
        rail.getByRole("heading", { name: "Fediverse", exact: true }),
      ).toHaveCount(0);
      await expect(rail.locator(".bsky-service-card")).toContainText(
        "reader.example",
      );
      await expect(rail.locator(".donate-block")).toHaveCount(0);
    }
  });
}

for (const [width, theme, direction] of [
  [320, "light", "ltr"],
  [412, "dark", "rtl"],
]) {
  test(`server discovery and picker ${width} ${theme}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(
      `${servers("working")}&globals=theme:${theme};direction:${direction}`,
    );
    const field = page.getByRole("combobox", { name: "Server instance" });
    await field.focus();
    await expect(page.getByRole("listbox")).toBeVisible();
    await expect(field).toHaveAttribute("aria-expanded", "true");
    await field.press("ArrowDown");
    await expect(page.getByRole("option")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(field).toHaveAttribute(
      "aria-activedescendant",
      await page.getByRole("option").getAttribute("id"),
    );
    await field.press("Escape");
    await expect(field).toHaveAttribute("aria-expanded", "false");
    await field.press("ArrowDown");
    await field.press("Enter");
    await expect(page.locator(".selection-result")).toHaveText(
      "Selected: https://community.example",
    );
    await field.fill("comm");
    await field.press("ArrowDown");
    await page.locator(".suggest-row").click();
    await expect(page.locator(".selection-result")).toHaveText(
      "Selected: https://community.example",
    );
    const discovery = page.getByRole("region", {
      name: "Server discovery",
      exact: true,
    });
    await discovery
      .getByRole("button", { name: "Find another server", exact: true })
      .click();
    await expect(discovery.locator("[mbSpinner]")).toBeVisible();
    await discovery
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
    await expect(
      discovery.getByRole("button", {
        name: "Find another server",
        exact: true,
      }),
    ).toBeVisible();
    await discovery
      .getByRole("button", { name: "Find another server", exact: true })
      .click();
    await expect(discovery.locator("[mbDiscoveryCandidate]")).toBeVisible();
    const search = page.getByRole("region", {
      name: "Search server discovery",
      exact: true,
    });
    await search
      .getByRole("button", { name: "Find a search server", exact: true })
      .click();
    await expect(search.locator("[mbDiscoveryCandidate]")).toContainText(
      "allows anonymous search",
    );
    await search
      .getByRole("button", { name: "Use this search server", exact: true })
      .click();
    await expect(page.locator(".selection-result")).toHaveText(
      "Selected: https://community.example",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("server-selection.png"),
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}

test("degraded servers require explicit acceptance", async ({ page }) => {
  await page.goto(servers("degraded"));
  const field = page.getByRole("combobox", { name: "Server instance" });
  await field.fill("community.example");
  await field.press("Enter");
  await expect(
    page.getByRole("button", { name: "Use anyway", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".selection-result")).toHaveText(
    "No selection yet",
  );
  await page.getByRole("button", { name: "Use anyway", exact: true }).click();
  await expect(page.locator(".selection-result")).toHaveText(
    "Selected: https://community.example",
  );
  const discovery = page.getByRole("region", {
    name: "Server discovery",
    exact: true,
  });
  await discovery.getByRole("checkbox").check();
  await discovery
    .getByRole("button", { name: "Find another server", exact: true })
    .click();
  await expect(discovery.locator("[mbDiscoveryCandidate]")).toContainText(
    "media.example",
  );
});

test("unreachable discovery retains retry and search-rejection controls", async ({
  page,
}) => {
  await page.goto(servers("unreachable"));
  const discovery = page.getByRole("region", {
    name: "Server discovery",
    exact: true,
  });
  await discovery
    .getByRole("button", { name: "Find another server", exact: true })
    .click();
  await expect(
    discovery.getByRole("button", { name: "Search again", exact: true }),
  ).toBeVisible();
  const search = page.getByRole("region", {
    name: "Search server discovery",
    exact: true,
  });
  await search
    .getByRole("button", { name: "Find a search server", exact: true })
    .click();
  await expect(search.locator(".sd-rejects")).toContainText("1 server");
  await search
    .getByRole("button", { name: "Forget them and re-check", exact: true })
    .click();
  await expect(search.locator(".sd-rejects")).toHaveCount(0);
  await expect(page.locator(".selection-result")).toHaveText(
    "No selection yet",
  );
});
