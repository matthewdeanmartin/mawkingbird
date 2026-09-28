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
  [
    "reject old button",
    '<mb-post-actions label="Post"><button class="action">Like</button></mb-post-actions>',
    1,
  ],
  [
    "reject wrapped link",
    '<mb-post-actions label="Post">@if (ready) { <div><a class="action open-original" href="/post">Read</a></div> }</mb-post-actions>',
    1,
  ],
  [
    "accept native shared actions",
    '<mb-post-actions label="Post"><button class="action" mbPostAction>Like</button><a class="action" mbPostAction href="/post">Read</a></mb-post-actions>',
    0,
  ],
  [
    "retain static counts and legacy disclosure",
    '<mb-post-actions label="Post"><span class="action action-static" mbActionCount>150</span><details><summary class="action">More</summary><button>Report</button></details></mb-post-actions>',
    0,
  ],
  [
    "do not misclassify other consumers",
    '<button class="action">Other</button><mb-post-actions label="Post"></mb-post-actions><a class="action" href="/elsewhere">Other</a>',
    0,
  ],
]) {
  test(name, () => {
    const messages = new Linter().verify(
      code,
      [
        {
          files: ["**/*.html"],
          languageOptions: { parser },
          plugins: { mb: plugin },
          rules: { "mb/require-shared-post-action": "error" },
        },
      ],
      { filename: "fixture.html" },
    );
    assert.equal(messages.length, count, JSON.stringify(messages));
    for (const message of messages)
      assert.equal(message.ruleId, "mb/require-shared-post-action");
  });
}
