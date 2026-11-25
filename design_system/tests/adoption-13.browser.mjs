import { createRequire } from "node:module";
const { test, expect } = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("@playwright/test");
const url =
  "/iframe.html?id=start-here-sprint-13-review--choose-and-report&viewMode=story";
const errors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const messages = [];
  errors.set(page, messages);
  page.on("pageerror", (e) => messages.push(e.message));
  page.on("console", (e) => {
    if (e.type() === "error") messages.push(e.text());
  });
  await page.goto(url);
  await expect(
    page.getByRole("heading", { name: "Bookmark choices and report forms." }),
  ).toBeVisible();
});
test.afterEach(async ({ page }) => expect(errors.get(page)).toEqual([]));
const click = (page, name) =>
  page.getByRole("button", { name, exact: true }).click();
/** A Mastodon report starts at the gate; every report then asks what is going on. */
const triage = async (page, choice, gate = true) => {
  if (gate) await click(page, "Continue");
  await page.locator(`[data-triage="${choice}"]`).click();
};
const notice = (page) => page.locator("mb-notice").getByRole("alert");
test("bookmark destinations preserve all three payloads and unavailable-link behavior", async ({
  page,
}) => {
  for (const [index, value] of [
    [0, "mastodon"],
    [1, "raindrop-post"],
    [2, "raindrop-link"],
  ]) {
    await click(page, "Bookmark destinations");
    await page.locator(".provider-choice").nth(index).click();
    await expect(page.locator("[data-result]")).toHaveText(value);
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await click(page, "Saved browser bookmark");
  await expect(page.getByRole("dialog")).toContainText("This browser");
  await expect(page.getByRole("dialog")).toContainText(
    "Remove the native bookmark",
  );
  await click(page, "Close");
  await expect(
    page.getByRole("button", { name: "Saved browser bookmark", exact: true }),
  ).toBeFocused();
  await click(page, "No external link");
  await expect(page.locator(".provider-choice")).toHaveCount(2);
  await expect(page.getByRole("dialog")).toContainText(
    "No external link was found",
  );
  await page.mouse.click(2, 2);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
for (const [label, destination] of [
  ["Mastodon post report", "Mastodon"],
  ["Bluesky post report", "Bluesky post"],
  ["Bluesky account report", "Bluesky account"],
]) {
  test(`${label} retains fields on failure and retries the exact destination`, async ({
    page,
  }) => {
    await click(page, label);
    const mastodon = destination === "Mastodon";
    await triage(page, mastodon ? "violation" : "report", mastodon);
    const chosen = page.locator(".report-chosen");
    await expect(chosen).toContainText(
      mastodon ? "It breaks a rule of" : "Report it to moderators",
    );
    const reason = page.getByLabel("What's wrong?", { exact: true });
    if (mastodon) await expect(reason).toHaveCount(0);
    else await expect(reason).not.toHaveValue("");
    const reasonValue = mastodon ? null : await reason.inputValue();
    // Mastodon asks which published server rule was broken; Bluesky has none.
    const rule = page.getByRole("checkbox", {
      name: "No spam or unsolicited advertising",
      exact: true,
    });
    if (destination === "Mastodon") await rule.check();
    else await expect(rule).toHaveCount(0);
    await page
      .getByLabel("Comment (optional)", { exact: true })
      .fill("Keep this explanation");
    await click(page, "Confirm report");
    await expect(notice(page)).toContainText("Could not send this report");
    if (destination === "Mastodon") await expect(rule).toBeChecked();
    await expect(chosen).toBeVisible();
    if (!mastodon) await expect(reason).toHaveValue(reasonValue);
    await expect(
      page.getByLabel("Comment (optional)", { exact: true }),
    ).toHaveValue("Keep this explanation");
    const request = JSON.parse(
      await page.locator("[data-request]").textContent(),
    );
    expect(request.destination).toBe(destination);
    expect(request.args).toContain("Keep this explanation");
    if (!mastodon) expect(request.args).toContain(reasonValue);
    if (destination === "Bluesky post")
      expect(request.args.slice(0, 2)).toEqual([
        "at://did:plc:preview/app.bsky.feed.post/exact",
        "exact-cid",
      ]);
    if (destination === "Bluesky account")
      expect(request.args[0]).toBe("did:plc:preview");
    if (destination === "Mastodon")
      expect(request.args).toEqual([
        "42",
        "violation",
        "Keep this explanation",
        ["preview-post"],
        { ruleIds: ["1"], forward: false },
      ]);
    await click(page, "Confirm report");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("[data-requests]")).toHaveText("2");
    expect(
      JSON.parse(await page.locator("[data-request]").textContent()),
    ).toEqual(request);
  });
}
test("held report disables duplicate sends but permits dismissal without cancelling the write", async ({
  page,
}) => {
  await click(page, "Hold");
  await click(page, "Mastodon post report");
  await triage(page, "spam");
  await click(page, "Confirm report");
  await expect(
    page.getByRole("button", { name: "Sending…", exact: true }),
  ).toBeDisabled();
  await expect(page.locator("[data-requests]")).toHaveText("1");
  await click(page, "Cancel");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("[data-pending]")).toHaveText("1");
  await click(page, "Complete held reports");
  await expect(page.locator("[data-pending]")).toHaveText("0");
});
test("missing exact reference refuses the report before transport", async ({
  page,
}) => {
  await click(page, "Missing post reference");
  await triage(page, "report", false);
  await click(page, "Confirm report");
  await expect(notice(page)).toContainText("exact Bluesky post");
  await expect(page.locator("[data-requests]")).toHaveText("0");
  await expect(
    page.getByRole("button", { name: "Confirm report", exact: true }),
  ).toBeEnabled();
});
for (const [width, theme, direction] of [
  [1280, "light", "ltr"],
  [375, "dark", "ltr"],
  [320, "light", "rtl"],
]) {
  test(`dialogs fit ${width} ${theme} ${direction}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto(`${url}&globals=theme:${theme};direction:${direction}`);
    for (const label of ["Bookmark destinations", "Mastodon post report"]) {
      await click(page, label);
      const dialog = page.getByRole("dialog");
      if (label === "Mastodon post report") {
        await triage(page, "spam");
        await click(page, "Confirm report");
        await expect(notice(page)).toContainText("Could not send");
      }
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expect(page.locator("html")).toHaveAttribute("dir", direction);
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      ).toBe(true);
      expect(
        await dialog.evaluate(
          (el) => el.getBoundingClientRect().height <= innerHeight - 30,
        ),
      ).toBe(true);
      await dialog.screenshot({
        path: info.outputPath(label.replaceAll(" ", "-") + ".png"),
      });
      await page.keyboard.press("Escape");
    }
  });
}
