import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const url =
  "/iframe.html?id=start-here-sprint-8-review--app-forms&viewMode=story";
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const list = [];
  errors.set(page, list);
  page.on("pageerror", (e) => list.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") list.push(e.text());
  });
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
const cases = [
  [
    "Announcements",
    "Morning draft",
    "Create",
    { kind: "announcement", content: "Morning draft", published: true },
  ],
  [
    "Domain blocks",
    "spam.example",
    "Block",
    { kind: "domain", domain: "spam.example", severity: "silence" },
  ],
  [
    "Allowed domains",
    "friend.example",
    "Allow",
    { kind: "allow", domain: "friend.example" },
  ],
  [
    "Email blocks",
    "spam.example",
    "Block",
    { kind: "email", domain: "spam.example" },
  ],
  [
    "IP blocks",
    "203.0.113.0/24",
    "Block",
    { kind: "ip", ip: "203.0.113.0/24", severity: "no_access", comment: "" },
  ],
  [
    "Canonical email",
    "reader@example.test",
    "Block",
    { kind: "canonical", email: "reader@example.test" },
  ],
];
for (const [region, value, action, payload] of cases)
  test(`${region}: empty guard, failed save and retained-input retry`, async ({
    page,
  }) => {
    await page.goto(url);
    const scope = page.getByRole("region", { name: region, exact: true });
    const input = scope.locator("mb-field input, mb-field textarea").first();
    const button = scope.getByRole("button", { name: action, exact: true });
    await input.fill("   ");
    await expect(button).toBeDisabled();
    await input.fill(value);
    if (region === "Domain blocks") await input.press("Enter");
    else await button.click();
    await expect(button).toBeDisabled();
    await expect(scope.getByRole("alert")).toHaveText(
      "Could not save. Your entries are still here; try again.",
    );
    await expect(input).toHaveValue(value);
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("output")).toHaveText(JSON.stringify(payload));
    await button.click();
    await expect(input).toHaveValue("");
    await expect(input).not.toHaveAttribute("aria-invalid", "true");
  });
test("canonical lookup has named controls and recovers without losing the email", async ({
  page,
}) => {
  await page.goto(url);
  const scope = page.getByRole("region", {
    name: "Canonical email",
    exact: true,
  });
  const input = scope.getByRole("textbox", {
    name: "test an email against existing blocks",
    exact: true,
  });
  await input.fill("reader@example.test");
  await input.press("Enter");
  await expect(
    scope.getByRole("button", { name: "Test match" }),
  ).toBeDisabled();
  await expect(scope.getByRole("alert")).toHaveText(
    "Could not check this email. Try again.",
  );
  await expect(input).toHaveValue("reader@example.test");
  await input.press("Enter");
  await expect(
    scope.getByText("No match — this email is not blocked.", { exact: true }),
  ).toBeVisible();
});
test("isolated adopted consent remains keyboard and label operable", async ({
  page,
}) => {
  await page.goto(url);
  const scope = page.getByRole("region", { name: "Registration consent" });
  const input = scope.getByRole("checkbox");
  await scope.getByText("I agree to the server rules", { exact: true }).click();
  await expect(input).toBeChecked();
  await input.focus();
  await page.keyboard.press("Space");
  await expect(input).not.toBeChecked();
});
for (const [theme, width, direction] of [
  ["light", 1280, "ltr"],
  ["dark", 380, "ltr"],
  ["light", 380, "rtl"],
])
  test(`adopted admin forms ${theme} ${width} ${direction}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`${url}&globals=theme:${theme};direction:${direction}`);
    await expect(page.locator("mb-field")).toHaveCount(10);
    await expect(page.locator("button[mbButton]")).toHaveCount(7);
    for (const field of await page.locator("mb-field").all()) {
      const label = field.locator("label");
      const control = field.locator(".mb-control");
      await expect(label).toHaveAttribute(
        "for",
        await control.getAttribute("id"),
      );
      expect((await label.innerText()).trim().length).toBeGreaterThan(0);
      await expect(control).toBeVisible();
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("forms.png"),
      fullPage: true,
    });
  });
