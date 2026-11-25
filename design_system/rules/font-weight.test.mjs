import { readFileSync, readdirSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const root = new URL("../../ui/src/", import.meta.url);

/** Declarations asking for a weight the app's fonts do not have. */
function tooHeavy(css) {
  return [
    ...css.matchAll(
      /\bfont(?:-weight)?:\s*(?:[89]\d\d|7[1-9]\d|70[1-9]|1000|bolder)\b/g,
    ),
  ].map((match) => match[0]);
}

test("no text is heavier than bold", () => {
  const found = [];
  for (const file of readdirSync(root, { recursive: true })) {
    if (!/\.(?:css|ts)$/.test(file) || /\.spec\.ts$/.test(file)) continue;
    const source = readFileSync(
      new URL(file.replaceAll("\\", "/"), root),
      "utf8",
    );
    for (const declaration of tooHeavy(source))
      found.push(`${file}: ${declaration}`);
  }
  assert.deepEqual(
    found,
    [],
    "Use font-weight: 700. Arial has no heavier face, so Windows substitutes Arial Black, a wider typeface with blurry edges.",
  );
});

test("recognizes both spellings and leaves ordinary weights alone", () => {
  assert.equal(tooHeavy("a { font-weight: 800; }").length, 1);
  assert.equal(tooHeavy("a { font: 900 14px / 1.3 var(--x); }").length, 1);
  assert.equal(tooHeavy("a { font-weight: bolder; }").length, 1);
  assert.equal(tooHeavy("a { font-weight: 700; font: 600 13px x; }").length, 0);
});
