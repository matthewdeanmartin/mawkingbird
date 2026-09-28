import { createRequire } from "node:module";
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import config from "../stylelint.config.mjs";

const stylelint = createRequire(
  new URL("../../ui/package.json", import.meta.url),
)("stylelint");

for (const declaration of [
  "color: #fff",
  "color: var(--text, #333)",
  "box-shadow: 0 2px 4px rgb(0 0 0 / 20%)",
  "background: linear-gradient(red, blue)",
  "border: 1px solid hsl(0 0% 50%)",
]) {
  test(`rejects literal color: ${declaration}`, async () => {
    const result = await stylelint.lint({
      code: `.sample { ${declaration}; }`,
      config,
    });
    assert.equal(result.errored, true);
    assert.ok(
      result.results[0].warnings.some((warning) =>
        /theme token/.test(warning.text),
      ),
    );
  });
}

test("accepts theme colors, transparent, currentColor and token-based mixes", async () => {
  const result = await stylelint.lint({
    code: ".sample { color: var(--text); border: 1px solid currentColor; background: color-mix(in srgb, var(--accent) 10%, transparent); }",
    config,
  });
  assert.equal(result.errored, false);
});

test("rejects styling escape hatches", async () => {
  const result = await stylelint.lint({
    code: ":host ::ng-deep button { padding: 13px !important; }",
    config,
  });
  assert.equal(result.results[0].warnings.length, 2);
});

test("permits palette literals only in the canonical token file", async () => {
  const result = await stylelint.lint({
    code: ":root { --ds-error-text: #a41037; }",
    codeFilename: fileURLToPath(new URL("../tokens.css", import.meta.url)),
    config,
  });
  assert.equal(result.errored, false);
});
