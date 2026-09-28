import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
const require = createRequire(
  new URL("../../ui/package.json", import.meta.url),
);
const { Linter } = require("eslint");
const parser = require("@angular-eslint/template-parser");
const plugin = require("../design_system/rules/toolbar.cjs");
for (const [name, code, count] of [
  ["reject copied tab strip", '<div class="tabs"></div>', 1],
  ["reject local tab button", '<button class="tab active">Posts</button>', 1],
  ["reject hand-built tablist", '<section role="tablist"></section>', 1],
  [
    "allow shared tabs",
    '<mb-tabs label="Panels"><ng-template mbTab value="posts" label="Posts">Text</ng-template></mb-tabs>',
    0,
  ],
  [
    "retain route links",
    '<nav><a class="tab" routerLink="/posts">Posts</a></nav>',
    0,
  ],
])
  test(name, () => {
    const messages = new Linter().verify(
      code,
      [
        {
          files: ["**/*.html"],
          languageOptions: { parser },
          plugins: { mb: plugin },
          rules: { "mb/prefer-shared-local-tabs": "error" },
        },
      ],
      { filename: "fixture.html" },
    );
    assert.equal(messages.length, count, JSON.stringify(messages));
    for (const message of messages)
      assert.equal(message.ruleId, "mb/prefer-shared-local-tabs");
  });
