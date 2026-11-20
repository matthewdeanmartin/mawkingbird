import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { test } from "node:test";
import { buildCatalogue } from "./catalogue.mjs";
import { planApprovedEdit, sourceHash } from "./source-edit.mjs";
import { redraftAcrossPairs, validateRedraftSettings } from "./redraft.mjs";
import { updateTranslationJson } from "./translations.mjs";
import { canApprove, saveApproval } from "./approval.mjs";

const root = resolve(import.meta.dirname, "..");
const records = buildCatalogue();

test("approval changes an English i18n comment without touching surrounding source", () => {
  const record = records.find(
    (item) => item.key === "pagesWelcomeBack.eyebrow",
  );
  const source = readFileSync(resolve(root, record.file), "utf8");
  const next = planApprovedEdit(
    record,
    source,
    sourceHash(source),
    "Nearly there",
  );
  assert.equal(
    next.slice(0, record.edit.start),
    source.slice(0, record.edit.start),
  );
  assert.equal(
    next.slice(record.edit.start, record.edit.start + "Nearly there".length),
    "Nearly there",
  );
  assert.equal(
    next.slice(record.edit.start + "Nearly there".length),
    source.slice(record.edit.end),
  );
  assert.match(next, /i18n pagesWelcomeBack\.eyebrow: Nearly there/);
  assert.throws(
    () =>
      planApprovedEdit(
        record,
        source + " ",
        sourceHash(source),
        "Nearly there",
      ),
    /source changed/,
  );
});

test("approval rejects changed placeholders and markup", () => {
  const record = {
    file: "ui/src/app/demo.ts",
    text: "Hello {{count}} <strong>people</strong>",
    edit: { start: 16, end: 55, format: "i18n-comment" },
  };
  const source = "// i18n demo: Hello {{count}} <strong>people</strong>";
  record.edit.start = source.indexOf("Hello");
  record.edit.end = source.length;
  assert.throws(
    () => planApprovedEdit(record, source, sourceHash(source), "Hello people"),
    /placeholder/,
  );
  assert.throws(
    () =>
      planApprovedEdit(
        record,
        source,
        sourceHash(source),
        "Hello {{count}} people",
      ),
    /HTML tags/,
  );
});

test("i18n approval invalidates one key in a locale and updates generated English", () => {
  const key = "statusCard.aiTranslationDescription";
  const de = readFileSync(resolve(root, "ui/public/i18n/de.json"), "utf8");
  const en = readFileSync(resolve(root, "ui/public/i18n/en.json"), "utf8");
  const invalidated = updateTranslationJson(de, key, "", "invalidate");
  assert.equal(invalidated.removed, true);
  assert.equal(
    Object.hasOwn(
      JSON.parse(invalidated.text).statusCard,
      "aiTranslationDescription",
    ),
    false,
  );
  assert.equal(
    JSON.parse(de).statusCard.aiTranslation,
    JSON.parse(invalidated.text).statusCard.aiTranslation,
  );
  const updated = updateTranslationJson(en, key, "Revised English", "english");
  assert.equal(
    JSON.parse(updated.text).statusCard.aiTranslationDescription,
    "Revised English",
  );
  assert.equal(
    updateTranslationJson(invalidated.text, key, "", "invalidate").removed,
    false,
  );
});

test("saving an approved draft updates source and English, and removes translated entries", () => {
  const temp = mkdtempSync(join(tmpdir(), "mawkingbird-museum-"));
  assert.ok(resolve(temp).startsWith(resolve(tmpdir()) + sep));
  try {
    const app = join(temp, "ui", "src", "app");
    const locales = join(temp, "ui", "public", "i18n");
    mkdirSync(app, { recursive: true });
    mkdirSync(locales, { recursive: true });
    const source = "// i18n demo.label: Old wording\nconst untouched = true;\n";
    writeFileSync(join(app, "demo.ts"), source, "utf8");
    for (const [locale, label] of [
      ["en", "Old wording"],
      ["de", "Alte Formulierung"],
      ["fr", "Ancien texte"],
    ]) {
      writeFileSync(
        join(locales, `${locale}.json`),
        JSON.stringify({ demo: { label, other: "Keep" } }, null, 2) + "\n",
        "utf8",
      );
    }
    const record = {
      file: "ui/src/app/demo.ts",
      key: "demo.label",
      text: "Old wording",
      edit: {
        start: source.indexOf("Old wording"),
        end: source.indexOf("Old wording") + "Old wording".length,
        format: "i18n-comment",
      },
    };
    const result = saveApproval(
      { record, sourceHash: sourceHash(source) },
      "New wording",
      temp,
    );
    assert.deepEqual(result.invalidated, ["de", "fr"]);
    assert.equal(
      readFileSync(join(app, "demo.ts"), "utf8"),
      source.replace("Old wording", "New wording"),
    );
    assert.equal(
      JSON.parse(readFileSync(join(locales, "en.json"), "utf8")).demo.label,
      "New wording",
    );
    for (const locale of ["de", "fr"]) {
      const data = JSON.parse(
        readFileSync(join(locales, `${locale}.json`), "utf8"),
      );
      assert.equal(Object.hasOwn(data.demo, "label"), false);
      assert.equal(data.demo.other, "Keep");
    }
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("simple HTML can be approved only without a translated sibling", () => {
  const temp = mkdtempSync(join(tmpdir(), "mawkingbird-museum-"));
  assert.ok(resolve(temp).startsWith(resolve(tmpdir()) + sep));
  try {
    const app = join(temp, "ui", "src", "app");
    mkdirSync(app, { recursive: true });
    const source = "<p>Old wording</p>\n";
    const path = join(app, "demo.html");
    writeFileSync(path, source, "utf8");
    const record = {
      file: "ui/src/app/demo.html",
      key: "",
      text: "Old wording",
      edit: {
        start: source.indexOf("Old wording"),
        end: source.indexOf("Old wording") + "Old wording".length,
        format: "html-text",
      },
    };
    assert.equal(canApprove(record, temp), true);
    const result = saveApproval(
      { record, sourceHash: sourceHash(source) },
      "New wording",
      temp,
    );
    assert.equal(result.key, null);
    assert.deepEqual(result.invalidated, []);
    assert.equal(readFileSync(path, "utf8"), "<p>New wording</p>\n");
    writeFileSync(
      join(app, "demo.de.html"),
      "<p>Alte Formulierung</p>\n",
      "utf8",
    );
    assert.equal(canApprove(record, temp), false);
    assert.throws(
      () =>
        saveApproval(
          { record, sourceHash: sourceHash(source) },
          "Another",
          temp,
        ),
      /separate translations/,
    );
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
});

test("three models crossed with three instructions produce nine independent requests", async () => {
  const settings = validateRedraftSettings({
    models: ["a/one", "b/two", "c/three"],
    instructions: ["Check claims", "Shorten", "Clarify privacy"],
    alternativesPerPair: 2,
  });
  const calls = [];
  const fakeFetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    return {
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                alternatives: [`${body.model} A`, `${body.model} B`],
              }),
            },
          },
        ],
      }),
    };
  };
  const results = await redraftAcrossPairs(
    { text: "Original" },
    settings,
    "test-key",
    fakeFetch,
  );
  assert.equal(calls.length, 9);
  assert.equal(results.length, 9);
  assert.equal(
    results.reduce((sum, result) => sum + result.alternatives.length, 0),
    18,
  );
  assert.deepEqual(
    new Set(
      results.map(
        (result) => `${result.modelIndex}:${result.instructionIndex}`,
      ),
    ).size,
    9,
  );
  assert.ok(
    calls.every((call) => call.messages[1].content.includes("Original")),
  );
});
