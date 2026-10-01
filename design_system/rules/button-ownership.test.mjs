import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const require = createRequire(
  new URL("../../ui/package.json", import.meta.url),
);
const postcss = require("postcss");
const root = new URL("../../ui/src/app/", import.meta.url);

test("pages leave shared button appearance to the design system", () => {
  const violations = [];
  for (const file of readdirSync(root, { recursive: true })) {
    if (!file.endsWith(".css") || file.includes("design-system")) continue;
    postcss
      .parse(readFileSync(new URL(file.replaceAll("\\", "/"), root), "utf8"))
      .walkRules((rule) => {
        if (
          !/\.btn(?:\b|-(?:outline|sm|small|danger)\b)|\[mbButton\]/.test(
            rule.selector,
          )
        )
          return;
        rule.walkDecls((declaration) => {
          if (
            /^(?:background|color|border|padding|font|opacity|filter|min-height)/.test(
              declaration.prop,
            )
          ) {
            violations.push(`${file}: ${rule.selector}: ${declaration.prop}`);
          }
        });
      });
  }
  assert.deepEqual(
    violations,
    [],
    "Use MbButton variants and design_system/tokens.css for appearance; pages own layout only.",
  );
});
