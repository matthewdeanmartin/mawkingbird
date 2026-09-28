import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const require = createRequire(
  new URL("../../ui/package.json", import.meta.url),
);
const { Linter } = require("eslint");
const { ESLint } = require("eslint");
const parser = require("@angular-eslint/template-parser");
const plugin = require("../design_system/rules/toolbar.cjs");
const config = [
  {
    files: ["**/*.html"],
    languageOptions: { parser },
    plugins: { mb: plugin },
    rules: { "mb/no-pill-in-toolbar": "error" },
  },
];
for (const [name, code, count] of [
  [
    "legacy pill class",
    '<mb-toolbar label="Feed"><button class="btn btn-sm">Refresh</button></mb-toolbar>',
    1,
  ],
  ["standalone pill", "<button mbButton>Save</button>", 0],
  [
    "compact button",
    '<mb-toolbar label="Feed"><button mbToolbarButton>Refresh</button></mb-toolbar>',
    0,
  ],
  [
    "pill in toolbar",
    '<mb-toolbar label="Feed"><button mbButton>Refresh</button></mb-toolbar>',
    1,
  ],
  [
    "control flow",
    '<mb-toolbar label="Feed">@if (ready) { <div><button mbButton>Refresh</button></div> }</mb-toolbar><button mbButton>Save</button>',
    1,
  ],
]) {
  test(name, () => {
    const messages = new Linter().verify(code, config, {
      filename: "fixture.html",
    });
    assert.equal(messages.length, count, JSON.stringify(messages));
    for (const message of messages)
      assert.equal(message.ruleId, "mb/no-pill-in-toolbar");
  });
}

test("application lint processes inline Angular templates", async () => {
  const eslint = new ESLint({
    cwd: fileURLToPath(new URL("../../ui", import.meta.url)),
  });
  const results = await eslint.lintText(
    `import { Component } from '@angular/core';
     @Component({ selector: 'app-fixture', template: '<mb-toolbar label="Feed"><button mbButton type="button">Refresh</button></mb-toolbar>' })
     export class Fixture {}`,
    { filePath: "src/app/fixture.component.ts" },
  );
  assert.equal(
    results
      .flatMap((result) => result.messages)
      .filter((message) => message.ruleId === "mb/no-pill-in-toolbar").length,
    1,
  );
});
