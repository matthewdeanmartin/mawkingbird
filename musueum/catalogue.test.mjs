import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { buildCatalogue, sourceExcerpt } from "./catalogue.mjs";

const root = resolve(import.meta.dirname, "..");
const records = buildCatalogue();

test("catalogue includes English i18n, template, and typed copy with source locations", () => {
  assert.ok(records.length > 9000);
  assert.ok(
    records.some(
      (item) =>
        item.key === "pagesWelcomeBack.eyebrow" && item.text === "Almost there",
    ),
  );
  assert.ok(
    records.some(
      (item) =>
        item.kind === "copy" &&
        item.text.includes("A new Mastodon account starts"),
    ),
  );
  assert.ok(
    records.some(
      (item) =>
        item.kind === "essay" &&
        item.text.includes("Some features require a Mawkingbird backend"),
    ),
  );
  assert.ok(
    records.some(
      (item) =>
        item.kind === "template" &&
        item.text.includes("How to be (pseudo)anonymous"),
    ),
  );
  assert.ok(
    records.some(
      (item) =>
        item.kind === "template" &&
        item.file.endsWith(".ts") &&
        item.text.includes("No archive yet?"),
    ),
  );
  assert.ok(
    records.every(
      (item) => item.file.startsWith("ui/src/app/") && item.line > 0,
    ),
  );
  assert.ok(
    records.every(
      (item) => !/\.(?:de|fr|es|ja|zh-hant)\.html$/i.test(item.file),
    ),
  );
});

test("review prompts are questions about claim wording, without template syntax noise", () => {
  assert.ok(
    records.some(
      (item) =>
        item.review.includes("privacy") &&
        /page-view analytics/i.test(item.text),
    ),
  );
  assert.ok(
    records.some(
      (item) =>
        item.review.includes("hosting") && /open.source/i.test(item.text),
    ),
  );
  assert.ok(
    records.some(
      (item) =>
        item.review.includes("privacy") &&
        item.text.includes("Optional Plus sync"),
    ),
  );
  assert.ok(
    records
      .filter((item) => item.kind === "template")
      .every((item) => !/^@(?:if|for|else)\b/.test(item.text)),
  );
});

test("source context is confined to client source", () => {
  const record = records.find(
    (item) => item.key === "pagesWelcomeBack.eyebrow",
  );
  const excerpt = sourceExcerpt(record.file, record.line);
  assert.match(excerpt.text, /Almost there/);
  assert.equal(sourceExcerpt("../AGENTS.md", 1), null);
  assert.equal(sourceExcerpt("ui/src/app/../styles.css", 1), null);
});

test("every i18n edit range points at its displayed English source", () => {
  const sources = new Map();
  for (const record of records.filter((item) => item.key)) {
    if (!sources.has(record.file))
      sources.set(
        record.file,
        readFileSync(resolve(root, record.file), "utf8"),
      );
    const source = sources.get(record.file);
    assert.ok(record.edit, record.key);
    assert.equal(
      source
        .slice(record.edit.start, record.edit.end)
        .replace(/\s+/g, " ")
        .trim(),
      record.text,
      `${record.file}:${record.line} ${record.key}`,
    );
  }
  assert.equal(new Set(records.map((item) => item.id)).size, records.length);
});
