import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(
  new URL("../../ui/package.json", import.meta.url),
);
const postcss = require("postcss");
const root = new URL("../../ui/src/app/", import.meta.url);

test("app consumers import identity leaf widgets instead of eagerly loading the catalogue", () => {
  for (const file of readdirSync(root, { recursive: true })) {
    if (
      !file.endsWith(".ts") ||
      file.endsWith(".spec.ts") ||
      file.includes("design-system")
    )
      continue;
    const source = readFileSync(
      new URL(file.replaceAll("\\", "/"), root),
      "utf8",
    );
    assert.doesNotMatch(
      source,
      /from\s+['"][^'"]*design-system\/identity\/identity['"]/,
      file,
    );
  }
});

test("projected identity styles stay namespaced", () => {
  for (const [file, namespace] of [
    ["rail-card", "mbRailCard"],
    ["profile-stack", "mbProfileStack"],
    ["identity-row", "mbIdentityRow"],
    ["account-card", "mbAccountCard"],
    ["server-picker", "mbServerPickerSurface"],
    ["discovery-candidate", "mbDiscoveryCandidate"],
    ["switch", "mbSwitch"],
  ]) {
    postcss
      .parse(
        readFileSync(
          new URL(`design-system/identity/${file}.css`, root),
          "utf8",
        ),
      )
      .walkRules((rule) => {
        for (const selector of rule.selectors)
          assert.ok(
            selector.startsWith(`[${namespace}]`),
            `${file}: ${selector}`,
          );
      });
  }
});

function appearanceCopies(css) {
  const found = [];
  postcss.parse(css).walkRules((rule) => {
    if (
      !rule.selectors.some((selector) =>
        /^\.(?:card|card-title|suggestion|peek|candidate|sd-candidate|server-suggest|suggest-row|server-mode-switch|rail-link)$/.test(
          selector,
        ),
      )
    )
      return;
    rule.walkDecls((declaration) => {
      if (/^(?:background|border|color|font|box-shadow)/.test(declaration.prop))
        found.push(`${rule.selector}: ${declaration.prop}`);
    });
  });
  return found;
}

test("identity ownership accepts placement but rejects local appearance copies", () => {
  assert.deepEqual(
    appearanceCopies(
      ".card { margin-bottom: 12px; } .suggestion { min-width: 0; }",
    ),
    [],
  );
  assert.deepEqual(
    appearanceCopies(
      ".card { border-radius: 14px; background: var(--col-bg); }",
    ),
    [".card: border-radius", ".card: background"],
  );
  assert.deepEqual(appearanceCopies(".suggest-row { color: var(--text); }"), [
    ".suggest-row: color",
  ]);
});

test("rails and server controls leave migrated appearance to shared widgets", () => {
  for (const file of [
    "shell/left-rail/left-rail",
    "shell/right-rail/right-rail",
    "shell/left-rail/profile-stack/profile-stack",
    "server-discovery/server-discovery",
    "search-server-discovery/search-server-discovery",
    "server-picker/server-picker",
  ]) {
    assert.deepEqual(
      appearanceCopies(readFileSync(new URL(`${file}.css`, root), "utf8")),
      [],
      file,
    );
  }
});
