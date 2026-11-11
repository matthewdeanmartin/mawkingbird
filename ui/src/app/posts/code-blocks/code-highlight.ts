/**
 * Syntax colouring for rendered code blocks. Loaded lazily, and only when a
 * post on screen contains a fenced block: highlight.js core plus a curated set
 * of languages, so the first page load never pays for it.
 */
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import c from 'highlight.js/lib/languages/c';
import cpp from 'highlight.js/lib/languages/cpp';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';

const LANGUAGES = {
  bash,
  c,
  cpp,
  css,
  go,
  javascript,
  json,
  python,
  rust,
  sql,
  typescript,
  xml,
  yaml,
};
for (const [name, language] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, language);
}

/** Highlighted HTML for `code`, or null when the language is not one we load. */
export function highlightToHtml(code: string, language: string): string | null {
  if (!language || !hljs.getLanguage(language)) return null;
  return hljs.highlight(code, { language, ignoreIllegals: true }).value;
}

/**
 * Colour one `<code class="language-x">` in place.
 *
 * highlight.js escapes the source and only adds `<span class="hljs-…">`, so
 * the result is no more able to run anything than the escaped text it replaces.
 */
export function highlightElement(code: HTMLElement): void {
  const language = /(?:^|\s)language-([\w+#.-]+)/.exec(code.className)?.[1] ?? '';
  const html = highlightToHtml(code.textContent ?? '', language);
  if (html !== null) code.innerHTML = html;
}

/** One coloured run of text on one line, for drawing code onto a canvas. */
export interface CodeToken {
  text: string;
  /** The highlight.js scope, e.g. 'keyword' or 'string'; '' for plain text. */
  scope: string;
}

/** Highlight `code` and split it into lines of tokens. */
export function tokenizeLines(code: string, language: string): CodeToken[][] {
  const html = highlightToHtml(code, language);
  if (html === null) return code.split('\n').map((line) => [{ text: line, scope: '' }]);
  const doc = new DOMParser().parseFromString(`<code>${html}</code>`, 'text/html');
  const lines: CodeToken[][] = [[]];
  const visit = (node: Node, scope: string): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      const parts = (node.textContent ?? '').split('\n');
      parts.forEach((part, i) => {
        if (i > 0) lines.push([]);
        if (part) lines[lines.length - 1].push({ text: part, scope });
      });
      return;
    }
    if (node instanceof Element) {
      const own = /hljs-([\w-]+)/.exec(node.className)?.[1] ?? scope;
      for (const child of node.childNodes) visit(child, own);
    }
  };
  for (const child of doc.body.firstChild?.childNodes ?? []) visit(child, '');
  return lines;
}
