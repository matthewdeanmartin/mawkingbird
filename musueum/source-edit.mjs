import { createHash } from "node:crypto";

export function sourceHash(source) {
  return createHash("sha256").update(source).digest("hex");
}

function placeholders(text) {
  return [...text.matchAll(/\{\{\s*[^{}]+?\s*\}\}/g)]
    .map((match) => match[0].replace(/\s+/g, ""))
    .sort();
}

function tags(text) {
  return [...text.matchAll(/<\/?[\w-]+(?:\s+[^<>]*?)?\s*\/?>/g)].map(
    (match) => match[0],
  );
}

function htmlEscape(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function planApprovedEdit(record, source, expectedHash, proposedText) {
  if (!record?.edit)
    throw new Error("This snippet cannot be edited automatically.");
  if (sourceHash(source) !== expectedHash)
    throw new Error(
      "The source changed since this draft was generated. Redraft it before approving.",
    );
  if (typeof proposedText !== "string")
    throw new Error("Draft text is missing.");
  const text = proposedText.trim();
  if (!text || text.length > 4000 || /[\r\n\u0000]/.test(text))
    throw new Error(
      "A draft must be one nonempty line of at most 4,000 characters.",
    );
  if (
    JSON.stringify(placeholders(text)) !==
    JSON.stringify(placeholders(record.text))
  )
    throw new Error("The draft must preserve every {{placeholder}}.");
  const { start, end, format } = record.edit;
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end > source.length ||
    end <= start
  )
    throw new Error("The source location is invalid.");
  const original = source.slice(start, end);
  let replacement;
  switch (format) {
    case "i18n-comment": {
      if (record.file.endsWith(".html") && /<!--|-->/.test(text))
        throw new Error("The draft cannot contain HTML comment delimiters.");
      if (JSON.stringify(tags(text)) !== JSON.stringify(tags(record.text)))
        throw new Error(
          "The draft must preserve the existing HTML tags exactly.",
        );
      if ((text.match(/</g) || []).length !== tags(text).length)
        throw new Error("The draft contains unsupported HTML markup.");
      replacement = text;
      break;
    }
    case "ts-literal":
      replacement = JSON.stringify(text);
      break;
    case "html-text": {
      if (original.includes("{{"))
        throw new Error("Dynamic template text needs a manual source edit.");
      const lead = original.match(/^\s*/)[0];
      const tail = original.match(/\s*$/)[0];
      replacement = `${lead}${htmlEscape(text)}${tail}`;
      break;
    }
    case "html-attribute":
      replacement = htmlEscape(text);
      break;
    default:
      throw new Error("Unsupported source format.");
  }
  if (replacement === original)
    throw new Error("The draft matches the current source.");
  return source.slice(0, start) + replacement + source.slice(end);
}
