import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { planApprovedEdit } from "./source-edit.mjs";
import { updateTranslationJson } from "./translations.mjs";

export function sourcePath(record, root) {
  const app = join(root, "ui", "src", "app");
  const path = resolve(root, record.file);
  if (!path.startsWith(app + sep) || !/\.(?:ts|html)$/.test(path))
    throw new Error("Source path is outside the client.");
  return path;
}

export function canApprove(record, root) {
  if (!record?.edit) return false;
  if (record.key && record.edit.format === "i18n-comment") return true;
  if (
    !record.file?.endsWith(".html") ||
    !["html-text", "html-attribute"].includes(record.edit.format)
  )
    return false;
  const stem = sourcePath(record, root).slice(0, -5);
  return ![
    "de",
    "es",
    "fr",
    "hi",
    "id",
    "it",
    "ja",
    "ko",
    "nl",
    "pl",
    "pt",
    "ru",
    "sv",
    "tr",
    "uk",
    "vi",
    "zh-hant",
  ].some((locale) => existsSync(`${stem}.${locale}.html`));
}

export function saveApproval(proposal, text, root) {
  const record = proposal.record;
  if (!canApprove(record, root))
    throw new Error(
      "This snippet has separate translations or markup that needs a manual source edit.",
    );
  const path = sourcePath(record, root);
  const source = readFileSync(path, "utf8");
  const updated = planApprovedEdit(record, source, proposal.sourceHash, text);
  const changes = new Map([[path, { before: source, after: updated }]]);
  const invalidated = [];
  if (record.key && record.edit.format === "i18n-comment") {
    const locales = join(root, "ui", "public", "i18n");
    const englishPath = join(locales, "en.json");
    const english = readFileSync(englishPath, "utf8");
    changes.set(englishPath, {
      before: english,
      after: updateTranslationJson(english, record.key, text.trim(), "english")
        .text,
    });
    for (const name of readdirSync(locales).filter(
      (name) => name.endsWith(".json") && name !== "en.json",
    )) {
      const localePath = join(locales, name);
      const before = readFileSync(localePath, "utf8");
      const change = updateTranslationJson(
        before,
        record.key,
        "",
        "invalidate",
      );
      if (change.removed) {
        changes.set(localePath, { before, after: change.text });
        invalidated.push(name.slice(0, -5));
      }
    }
  }
  const written = [];
  try {
    // Write the locale fallback before changing the English source.
    const entries = [...changes].sort(([a], [b]) =>
      a === path ? 1 : b === path ? -1 : a.localeCompare(b),
    );
    for (const [file, change] of entries) {
      writeFileSync(file, change.after, "utf8");
      written.push(file);
    }
  } catch (error) {
    for (const file of written.reverse()) {
      try {
        writeFileSync(file, changes.get(file).before, "utf8");
      } catch (rollbackError) {
        console.error("Could not restore", file, rollbackError);
      }
    }
    throw error;
  }
  return { file: record.file, key: record.key || null, invalidated };
}
