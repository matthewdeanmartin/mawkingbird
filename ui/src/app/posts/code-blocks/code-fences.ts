/**
 * Fenced code blocks (```python … ```) in post HTML.
 *
 * Posts stay plain text on the server; this is how Mawkingbird *shows* them.
 * Mastodon turns a typed fence into paragraphs and `<br>`s, so a fence spans
 * DOM nodes. This works on the parsed DOM rather than on text: lines outside a
 * fence keep their original nodes (links, mentions, custom emoji), and only the
 * lines inside one are flattened to text and moved into `<pre><code>`.
 *
 * This module is small and eager. Colors come later from `code-highlight.ts`,
 * which is loaded only when a rendered post actually contains a block.
 */

/** A fenced block as written: its language (normalised, may be '') and source. */
export interface CodeBlock {
  language: string;
  code: string;
}

const FENCE = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/;

const ALIASES: Record<string, string> = {
  py: 'python',
  python3: 'python',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  yml: 'yaml',
  html: 'xml',
  svg: 'xml',
  rs: 'rust',
  golang: 'go',
  'c++': 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  h: 'c',
};

/** The languages `code-highlight.ts` registers. Anything else shows uncoloured. */
export const HIGHLIGHT_LANGUAGES = [
  'python',
  'javascript',
  'typescript',
  'bash',
  'json',
  'sql',
  'xml',
  'css',
  'rust',
  'go',
  'yaml',
  'c',
  'cpp',
] as const;

const EXTENSIONS: Record<string, string> = {
  python: 'py',
  javascript: 'js',
  typescript: 'ts',
  bash: 'sh',
  json: 'json',
  sql: 'sql',
  xml: 'html',
  css: 'css',
  rust: 'rs',
  go: 'go',
  yaml: 'yaml',
  c: 'c',
  cpp: 'cpp',
};

/** Lower-case, alias-resolved language name ('' when none was given). */
export function normalizeLanguage(raw: string): string {
  const lang = raw.trim().toLowerCase();
  return ALIASES[lang] ?? lang;
}

/** A download name for a block: `snippet.py`, or `snippet-2.txt` for the second unknown one. */
export function codeFileName(block: CodeBlock, index = 0): string {
  const ext = EXTENSIONS[block.language] ?? 'txt';
  return `snippet${index > 0 ? `-${index + 1}` : ''}.${ext}`;
}

/** A human label for a block's language, e.g. "Python"; '' when unknown. */
export function languageLabel(language: string): string {
  const labels: Record<string, string> = {
    python: 'Python',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    bash: 'Shell',
    json: 'JSON',
    sql: 'SQL',
    xml: 'HTML',
    css: 'CSS',
    rust: 'Rust',
    go: 'Go',
    yaml: 'YAML',
    c: 'C',
    cpp: 'C++',
  };
  return labels[language] ?? language;
}

/** One visual line of a post: its nodes, its text, and which paragraph it is in. */
interface Line {
  nodes: ChildNode[];
  text: string;
  paragraph: number;
}

/** Flatten top-level paragraphs into lines, split at `<br>`. */
function linesOf(body: HTMLElement): Line[] {
  const lines: Line[] = [];
  const blocks = [...body.childNodes];
  const paragraphs =
    blocks.length && blocks.every((n) => n instanceof Element && n.tagName === 'P')
      ? blocks.map((p) => [...p.childNodes])
      : [blocks];
  paragraphs.forEach((children, paragraph) => {
    let current: Line = { nodes: [], text: '', paragraph };
    for (const child of children) {
      if (child instanceof Element && child.tagName === 'BR') {
        lines.push(current);
        current = { nodes: [], text: '', paragraph };
      } else {
        current.nodes.push(child);
        current.text += child.textContent ?? '';
      }
    }
    lines.push(current);
  });
  return lines;
}

interface Found {
  start: number;
  end: number;
  block: CodeBlock;
}

/** Find complete fences; an unclosed fence is left as ordinary text. */
function findFences(lines: Line[]): Found[] {
  const found: Found[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE.exec(lines[i].text);
    if (!open) continue;
    const marker = open[1];
    let end = -1;
    for (let j = i + 1; j < lines.length; j++) {
      const close = FENCE.exec(lines[j].text);
      if (close && close[1] === marker && !close[2]) {
        end = j;
        break;
      }
    }
    if (end < 0) continue;
    const parts: string[] = [];
    for (let k = i + 1; k < end; k++) {
      // A paragraph break inside the fence was a blank line in the source.
      if (k > i + 1 && lines[k].paragraph !== lines[k - 1].paragraph) parts.push('');
      parts.push(lines[k].text);
    }
    found.push({
      start: i,
      end,
      block: { language: normalizeLanguage(open[2]), code: parts.join('\n') },
    });
    i = end;
  }
  return found;
}

/** Every complete fenced block in a post's HTML, in order. */
export function extractCodeBlocks(html: string): CodeBlock[] {
  if (!html || !/```|~~~/.test(html)) return [];
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return findFences(linesOf(doc.body)).map((f) => f.block);
}

/**
 * Replace complete fences in `doc.body` with `<pre class="mb-code"><code>`.
 * Returns true when anything changed. The `language-*` class carries the
 * language through Angular's sanitizer, which keeps `class` but drops `data-*`.
 */
export function renderFences(doc: Document): boolean {
  const lines = linesOf(doc.body);
  const fences = findFences(lines);
  if (!fences.length) return false;
  const out: Node[] = [];
  let paragraph: HTMLParagraphElement | null = null;
  let lastParagraph = -1;
  let index = 0;
  for (let i = 0; i < lines.length; i++) {
    const fence = fences[index];
    if (fence && i === fence.start) {
      const pre = doc.createElement('pre');
      pre.className = 'mb-code';
      const code = doc.createElement('code');
      if (fence.block.language) code.className = `language-${fence.block.language}`;
      code.textContent = fence.block.code;
      pre.append(code);
      out.push(pre);
      paragraph = null;
      i = fence.end;
      index++;
      continue;
    }
    const line = lines[i];
    if (!paragraph || line.paragraph !== lastParagraph) {
      if (!line.nodes.length && !line.text) {
        // A stray empty line between a fence and the next paragraph.
        lastParagraph = line.paragraph;
        continue;
      }
      paragraph = doc.createElement('p');
      out.push(paragraph);
    } else {
      paragraph.append(doc.createElement('br'));
    }
    paragraph.append(...line.nodes);
    lastParagraph = line.paragraph;
  }
  doc.body.replaceChildren(...out);
  return true;
}
