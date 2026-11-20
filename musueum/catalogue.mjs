import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(new URL("../ui/package.json", import.meta.url));
const ts = require("typescript");

const ROOT = resolve(import.meta.dirname, "..");
const APP = join(ROOT, "ui", "src", "app");
const LOCALE_SUFFIX =
  /\.(?:de|es|fr|hi|id|it|ja|ko|nl|pl|pt|ru|sv|tr|uk|vi|zh-hant)\.html$/i;

const reviewRules = [
  {
    id: "privacy",
    label: "Privacy / data flow",
    pattern:
      /\b(?:track(?:ing|ed)?|analytics|telemetry|anonymous|never sent|nothing (?:is )?(?:uploaded|sent|fetched|leaves)|only in (?:this|your) browser|stays (?:on|in)|locally|no data|no backend|private|incognito|location data|third party|query string)\b/i,
  },
  {
    id: "completeness",
    label: "Absolute / complete",
    pattern:
      /\b(?:all|every|always|never|nothing|only|entire|whole|completely|without exception|guarantee[ds]?)\b/i,
  },
  {
    id: "cost",
    label: "Cost / availability",
    pattern:
      /\b(?:free(?: forever)?|no (?:cost|charge|subscription)|forever|unlimited)\b/i,
  },
  {
    id: "hosting",
    label: "Source / hosting",
    pattern:
      /\b(?:open[ -]source|self[ -]host|host (?:it|yourself)|your own server)\b/i,
  },
  {
    id: "outcome",
    label: "Outcome / ease",
    pattern:
      /\b(?:one click|effortless|easy to|you (?:will|can) (?:always|never)|works? (?:everywhere|with everything))\b/i,
  },
];

function files(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, out);
    else if (/\.(?:html|ts)$/.test(name) && !/\.spec\.ts$/.test(name))
      out.push(path);
  }
  return out;
}

function lineAt(source, offset) {
  let line = 1;
  for (let i = 0; i < offset; i++) if (source.charCodeAt(i) === 10) line++;
  return line;
}

function clean(value) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/\{\{[\s\S]*?\}\}/g, "…")
    .replace(/&(?:nbsp|#160);/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:39|x27);/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function isUseful(value) {
  return (
    value.length > 1 &&
    /[A-Za-z]/.test(value) &&
    !/^\.{1,3}$/.test(value) &&
    !/^[\[\]{}|]+$/.test(value) &&
    !/@(?:if|for|else|switch|case|default|defer|let|empty)\b/.test(value) &&
    !/[{}]/.test(value) &&
    !/\btrack\s+[\w.$]+/.test(value) &&
    !/\[[\w.-]+\]\s*=/.test(value) &&
    !/^\d+\s*\?/.test(value)
  );
}

function makeRecord(kind, value, path, source, offset, key = "", edit = null) {
  const text =
    kind === "template" ||
    kind === "attribute" ||
    kind === "eyebrow" ||
    kind === "essay"
      ? clean(value)
      : value.replace(/\s+/g, " ").trim();
  if (
    kind === "template" || kind === "attribute" || kind === "eyebrow"
      ? !isUseful(text)
      : !text
  )
    return null;
  const file = relative(ROOT, path).replaceAll("\\", "/");
  const line = lineAt(source, offset);
  const review = reviewRules
    .filter((rule) => rule.pattern.test(text))
    .map((rule) => rule.id);
  return {
    id: `${file}:${line}:${offset}:${kind}:${key}`,
    kind,
    text,
    key,
    file,
    line,
    area: file.split("/").slice(3, 5).join(" / ") || "app",
    review,
    edit,
  };
}

function propertyName(node) {
  return node && (ts.isIdentifier(node) || ts.isStringLiteral(node))
    ? node.text
    : "";
}

function englishCopy(source, path, add) {
  if (!/(?:copy|content|chrome)\.ts$/.test(path)) return;
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const roots = new Set();
  function discover(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      (/^en$/i.test(node.name.text) || node.name.text === "audienceContent") &&
      node.initializer &&
      ts.isObjectLiteralExpression(node.initializer)
    )
      roots.add(node.initializer);
    if (
      ts.isPropertyAssignment(node) &&
      propertyName(node.name) === "en" &&
      ts.isObjectLiteralExpression(node.initializer)
    )
      roots.add(node.initializer);
    if (
      ts.isObjectLiteralExpression(node) &&
      node.properties.some(
        (prop) =>
          ts.isPropertyAssignment(prop) &&
          ["lang", "language", "locale"].includes(propertyName(prop.name)) &&
          ts.isStringLiteral(prop.initializer) &&
          prop.initializer.text === "en",
      )
    )
      roots.add(node);
    ts.forEachChild(node, discover);
  }
  discover(tree);
  function visit(node) {
    if (ts.isPropertyAssignment(node)) {
      const name = propertyName(node.name);
      if (
        [
          "path",
          "href",
          "lang",
          "language",
          "locale",
          "target",
          "content",
          "learning",
          "setting",
        ].includes(name)
      )
        return;
      if (
        ts.isStringLiteral(node.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(node.initializer)
      ) {
        add(
          name === "eyebrow" ? "eyebrow" : "copy",
          node.initializer.text,
          node.initializer.getStart(tree),
          "",
          {
            start: node.initializer.getStart(tree),
            end: node.initializer.getEnd(),
            format: "ts-literal",
          },
        );
        return;
      }
    }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (
        !ts.isPropertyAssignment(node.parent) &&
        !ts.isImportDeclaration(node.parent) &&
        !ts.isPropertyAccessExpression(node.parent) &&
        !ts.isCallExpression(node.parent)
      ) {
        add("copy", node.text, node.getStart(tree), "", {
          start: node.getStart(tree),
          end: node.getEnd(),
          format: "ts-literal",
        });
      }
      return;
    }
    ts.forEachChild(node, visit);
  }
  for (const root of roots) visit(root);
}

function essayCopy(source, path, add) {
  if (
    !/ui[\\/]src[\\/]app[\\/]public-pages[\\/](?:docs[\\/]public-copy|credits[\\/]credits)\.ts$/.test(
      path,
    )
  )
    return;
  for (const body of source.matchAll(
    /\b(?:const|export const)\s+[A-Z_]*BODY\s*=\s*`([\s\S]*?)`;/g,
  )) {
    const html = body[1];
    const start = body.index + body[0].indexOf("`") + 1;
    for (const paragraph of html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)) {
      const content = paragraph[1];
      let offset = 0;
      for (const part of content.split(/<br\s*\/?>/i)) {
        add(
          "essay",
          part,
          start + paragraph.index + paragraph[0].indexOf(content) + offset,
        );
        offset += part.length + 4;
      }
    }
  }
}

function templateCopy(template, baseOffset, add, editable = true) {
  // Preserve source offsets while removing comments, then take visible text
  // and a few native accessibility attributes from the default template.
  const withoutComments = template.replace(/<!--[\s\S]*?-->/g, (m) =>
    " ".repeat(m.length),
  );
  for (const match of withoutComments.matchAll(/>([^<>]+)</g)) {
    const value = clean(match[1]);
    if (!isUseful(value) || /^…[\s.!?]*$/.test(value)) continue;
    const before = withoutComments.slice(
      Math.max(0, match.index - 220),
      match.index + 1,
    );
    const tag = before.match(/<([\w-]+)\b[^<>]*>\s*$/)?.[0] || "";
    const kind = /class\s*=\s*['"][^'"]*eyebrow/.test(tag)
      ? "eyebrow"
      : "template";
    const start = baseOffset + match.index + 1;
    add(
      kind,
      match[1],
      start,
      "",
      editable && !match[1].includes("{{")
        ? {
            start,
            end: start + match[1].length,
            format: "html-text",
          }
        : null,
    );
  }
  for (const match of withoutComments.matchAll(
    /\b(?:placeholder|title|aria-label|alt)\s*=\s*(["'])(.*?)\1/g,
  )) {
    if (match[2].includes("{{")) continue;
    const start = baseOffset + match.index + match[0].indexOf(match[2]);
    add(
      "attribute",
      match[2],
      start,
      "",
      editable
        ? {
            start,
            end: start + match[2].length,
            format: "html-attribute",
          }
        : null,
    );
  }
}

function inlineTemplateCopy(source, path, add) {
  if (!source.includes("template:")) return;
  const tree = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (
      ts.isPropertyAssignment(node) &&
      propertyName(node.name) === "template" &&
      (ts.isStringLiteral(node.initializer) ||
        ts.isNoSubstitutionTemplateLiteral(node.initializer))
    ) {
      templateCopy(
        node.initializer.text,
        node.initializer.getStart(tree) + 1,
        add,
        false,
      );
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
}

export function buildCatalogue() {
  const records = [];
  const keys = new Set();
  const seen = new Set();
  for (const path of files(APP)) {
    const source = readFileSync(path, "utf8");
    const isHtml = path.endsWith(".html");
    if (isHtml && LOCALE_SUFFIX.test(path)) continue;
    const add = (kind, value, offset, key = "", edit = null) => {
      const record = makeRecord(kind, value, path, source, offset, key, edit);
      if (!record) return;
      const signature = `${record.file}:${record.line}:${record.text}`;
      if (seen.has(signature)) return;
      seen.add(signature);
      records.push(record);
    };

    for (const match of source.matchAll(
      /<!--\s*i18n\s+([^\s:]+)\s*:\s*([\s\S]*?)\s*-->|\/\/\s*i18n\s+([^\s:]+)\s*:\s*(.*)$/gm,
    )) {
      const key = match[1] || match[3];
      const value = (match[2] || match[4]).replace(/\r$/, "");
      if (keys.has(key)) continue;
      keys.add(key);
      const start = match.index + match[0].indexOf(value);
      add(
        key.toLowerCase().includes("eyebrow") ? "eyebrow" : "i18n",
        value,
        match.index,
        key,
        {
          start,
          end: start + value.length,
          format: "i18n-comment",
        },
      );
    }

    if (isHtml) {
      templateCopy(source, 0, add);
    } else {
      inlineTemplateCopy(source, path, add);
      englishCopy(source, path, add);
      essayCopy(source, path, add);
    }
  }
  records.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
  return records;
}

export function sourceExcerpt(file, line) {
  if (
    !/^ui\/src\/app\/[\w./-]+\.(?:ts|html)$/.test(file) ||
    file.includes("..")
  )
    return null;
  const path = resolve(ROOT, file);
  if (!path.startsWith(APP)) return null;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  if (!Number.isInteger(line) || line < 1 || line > lines.length) return null;
  const start = Math.max(1, line - 3);
  const end = Math.min(lines.length, line + 4);
  return { file, line, start, text: lines.slice(start - 1, end).join("\n") };
}
