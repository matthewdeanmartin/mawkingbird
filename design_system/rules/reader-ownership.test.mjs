import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const require = createRequire(
  new URL("../../ui/package.json", import.meta.url),
);
const postcss = require("postcss");
const root = new URL("../../ui/src/app/", import.meta.url);

test("projected reader styles cannot leak into other app surfaces", () => {
  for (const [file, namespace] of [
    ["reader-preferences.css", "mbReaderPreferences"],
    ["reader-library.css", "mbReaderLibrary"],
    ["reader-search.css", "mbReaderSearch"],
  ]) {
    const css = readFileSync(
      new URL(`design-system/reader/${file}`, root),
      "utf8",
    );
    postcss.parse(css).walkRules((rule) => {
      for (const selector of rule.selectors) {
        assert.ok(
          selector.startsWith(`[${namespace}]`),
          `${file}: unscoped ${selector}`,
        );
      }
    });
  }
});

test("reader consumers leave extracted presentation in the design system", () => {
  const violations = [];
  for (const file of [
    "read-toolbar/read-toolbar",
    "library-panel/library-panel",
    "document-search/document-search-dialog",
    "notes-rail/notes-rail",
    "selection-tools/selection-tools",
  ]) {
    const css = readFileSync(new URL(`pages/read/${file}.css`, root), "utf8");
    postcss.parse(css).walkRules((rule) => {
      for (const selector of rule.selectors) {
        if (
          /^\.(?:typo-(?:row|label|value|stack)|rail-(?:row|folder|feed)|search-(?:field|result|context|page))(?:\b|[.#[: ])/.test(
            selector,
          )
        ) {
          violations.push(
            `${file}: ${selector} belongs to a reader DS component`,
          );
        }
        if (
          /^\.(?:typography|library|search-dialog|notes-rail|selection-tools)$/.test(
            selector,
          )
        ) {
          rule.walkDecls((declaration) => {
            if (
              /^(?:background|border|box-shadow|color|font)/.test(
                declaration.prop,
              )
            ) {
              violations.push(`${file}: ${selector}: ${declaration.prop}`);
            }
          });
        }
      }
    });
  }
  assert.deepEqual(
    violations,
    [],
    "Change shared reader presentation, not page-local copies. Reader placement remains local.",
  );
});
