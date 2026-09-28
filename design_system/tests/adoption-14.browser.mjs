import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const url =
  "/iframe.html?id=start-here-sprint-14-review--memberships&viewMode=story";
const errors = new WeakMap();
const click = (page, name) =>
  page.getByRole("button", { name, exact: true }).click();
const server = (page) =>
  page.getByRole("checkbox", { name: /^Server list with/ });
const collection = (page) =>
  page.getByRole("checkbox", { name: /^Public collection with/ });
const writes = (page) => page.locator("[data-writes]");
test.beforeEach(async ({ page }) => {
  const messages = [];
  errors.set(page, messages);
  page.on("pageerror", (e) => messages.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") messages.push(e.text());
  });
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "List membership, one shared form." }),
  ).toBeVisible();
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
test("list failures keep confirmed membership and retry without public following", async ({
  page,
}) => {
  await click(page, "Fail once");
  await click(page, "Lists and collections");
  await expect(page.getByRole("dialog")).toHaveAccessibleName(/^Add @/);
  await expect(
    page.getByRole("button", { name: "Create & add", exact: true }),
  ).toHaveCount(3);
  await server(page).click();
  await expect(page.locator("mb-notice")).toContainText("Preview write failed");
  await expect(server(page)).not.toBeChecked();
  await expect(server(page)).toBeEnabled();
  await server(page).click();
  await expect(server(page)).toBeChecked();
  await server(page).click();
  await expect(server(page)).not.toBeChecked();
  await expect(writes(page)).toHaveText("3");
  await expect(page.locator("[data-follows]")).toHaveText("0");
});
test("follow refusal requires explicit consent before follow and exact-list retry", async ({
  page,
}) => {
  await click(page, "Follow first");
  await click(page, "Lists and collections");
  await server(page).click();
  await expect(page.locator("mb-notice")).toContainText(
    "Following them is public",
  );
  await expect(server(page)).not.toBeChecked();
  await expect(page.locator("[data-follows]")).toHaveText("0");
  await click(page, "Follow and add");
  await expect(server(page)).toBeChecked();
  await expect(page.locator("[data-follows]")).toHaveText("1");
  const calls = (await page.locator("[data-calls]").textContent())
    .split("\n")
    .map(JSON.parse);
  expect(calls).toEqual([
    { name: "addToList", args: ["server", "target"] },
    { name: "follow", args: ["target"] },
    { name: "addToList", args: ["server", "target"] },
  ]);
});
test("cancelling follow consent never performs a follow", async ({ page }) => {
  await click(page, "Follow first");
  await click(page, "Lists and collections");
  await server(page).click();
  await click(page, "Cancel");
  await expect(server(page)).not.toBeChecked();
  await expect(page.locator("[data-follows]")).toHaveText("0");
  await expect(writes(page)).toHaveText("1");
});
test("collection failure is visible, preserves membership and retries", async ({
  page,
}) => {
  await click(page, "Fail once");
  await click(page, "Lists and collections");
  await collection(page).click();
  await expect(page.locator("mb-notice")).toContainText("Preview write failed");
  await expect(collection(page)).not.toBeChecked();
  await collection(page).click();
  await expect(collection(page)).toBeChecked();
  await collection(page).click();
  await expect(collection(page)).not.toBeChecked();
  await expect(page.locator("[data-calls]")).toContainText(
    "removeCollectionItem",
  );
});
test("create collection retains a failed name and retries through native Enter", async ({
  page,
}) => {
  await click(page, "Fail once");
  await click(page, "Lists and collections");
  const name = page.getByRole("textbox", {
    name: "New collection name",
    exact: true,
  });
  await name.fill("New collection");
  await name.press("Enter");
  await expect(page.locator("mb-notice")).toContainText("Preview write failed");
  await expect(name).toHaveValue("New collection");
  await name.press("Enter");
  await expect(
    page.getByRole("checkbox", { name: "New collection", exact: true }),
  ).toBeChecked();
  await expect(name).toHaveValue("");
  await expect(writes(page)).toHaveText("3");
});
test("empty server and browser lists can be created independently", async ({
  page,
}) => {
  await click(page, "Empty lists");
  await expect(page.getByRole("dialog")).toContainText("No lists yet");
  const name = page.getByRole("textbox", {
    name: "New list name",
    exact: true,
  });
  await name.fill("New server list");
  await name.press("Enter");
  await expect(
    page.getByRole("checkbox", { name: "New server list", exact: true }),
  ).toBeChecked();
  const local = page.getByRole("textbox", {
    name: "New private list name",
    exact: true,
  });
  await local.fill("Local only");
  await local.press("Enter");
  await expect(
    page.getByRole("checkbox", { name: "Local only", exact: true }),
  ).toBeChecked();
  await expect(writes(page)).toHaveText("2");
});
test("anonymous and browser memberships stay local and hide public collections", async ({
  page,
}) => {
  await click(page, "Anonymous lists");
  await expect(
    page.getByRole("textbox", { name: "New collection name" }),
  ).toHaveCount(0);
  for (const name of [
    "Anonymous local reading list",
    "Browser-private reading list",
  ]) {
    const check = page.getByRole("checkbox", { name, exact: true });
    await check.click();
    await expect(check).toBeChecked();
    await check.click();
    await expect(check).not.toBeChecked();
  }
  await expect(writes(page)).toHaveText("0");
  await expect(page.locator("[data-follows]")).toHaveText("0");
});
test("unsupported collections preserve the explanation without create controls", async ({
  page,
}) => {
  await click(page, "Collections unavailable");
  await expect(page.getByRole("dialog")).toContainText(
    "This server does not support collections",
  );
  await expect(
    page.getByRole("textbox", { name: "New collection name" }),
  ).toHaveCount(0);
});
test("pending writes disable the membership choice until confirmed", async ({
  page,
}) => {
  await click(page, "Slow");
  await click(page, "Lists and collections");
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  await server(page).click();
  await page.clock.runFor(32);
  await expect(server(page)).toBeDisabled();
  await expect(server(page)).not.toBeChecked();
  await expect(writes(page)).toHaveText("1");
  await page.clock.runFor(2100);
  await expect(server(page)).toBeChecked();
  await expect(server(page)).toBeEnabled();
});
test("nested membership restores parent focus and preserves its modal lock", async ({
  page,
}) => {
  await click(page, "Nested membership");
  const parent = page.getByRole("dialog", {
    name: "Account actions",
    exact: true,
  });
  await click(page, "Edit memberships");
  await expect(page.locator("dialog[open]")).toHaveCount(2);
  await expect(server(page)).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(
    parent.getByRole("button", { name: "Edit memberships" }),
  ).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.style.overflow),
  ).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
for (const [width, theme, direction] of [
  [1280, "light", "ltr"],
  [375, "dark", "ltr"],
  [320, "light", "rtl"],
]) {
  test(`membership form fits ${width} ${theme} ${direction}`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto(`${url}&globals=theme:${theme};direction:${direction}`);
    await click(page, "Follow first");
    await click(page, "Lists and collections");
    await server(page).click();
    await expect(page.locator("mb-notice")).toContainText(
      "Following them is public",
    );
    const modal = page.getByRole("dialog");
    expect(
      await modal.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
    expect(
      await modal.evaluate(
        (el) => el.getBoundingClientRect().height <= innerHeight - 30,
      ),
    ).toBe(true);
    await modal.screenshot({ path: info.outputPath("membership.png") });
    await click(page, "Cancel");
    await page
      .getByRole("textbox", { name: "New collection name", exact: true })
      .scrollIntoViewIfNeeded();
    await modal.screenshot({ path: info.outputPath("collection-fields.png") });
    await click(page, "Done");
    await expect(
      page.getByRole("button", { name: "Lists and collections", exact: true }),
    ).toBeFocused();
  });
}
