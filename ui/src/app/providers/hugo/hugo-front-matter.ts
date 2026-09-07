/**
 * Hugo front matter: build it, and read it back without losing anything.
 *
 * Pure by design — no HTTP, no Angular — because this is where all the fiddly
 * correctness lives and it should be testable without a single mock. Titles
 * contain quotes and backslashes, dates have to round-trip, and a post written
 * by some other tool carries keys we have never heard of.
 *
 * We *write* TOML (`+++`), which is Hugo's own default and what its archetypes
 * emit. We *read* both TOML and YAML (`---`), because a template repo may well
 * have shipped YAML posts and an edit must not corrupt them. The rule for edits
 * is preservation: {@link parseFrontMatter} keeps the raw delimiter and the
 * untouched key lines, and {@link serializeFrontMatter} puts back what it was
 * given. Mawkingbird changes the fields it owns and nothing else.
 */

/** The delimiter style a file actually used, so an edit can put it back. */
export type FrontMatterFormat = 'toml' | 'yaml';

export interface ParsedPost {
  /** Which delimiter the file used. A file with none reads as `toml`. */
  format: FrontMatterFormat;
  /** True when the file had no front matter block at all. */
  missing: boolean;
  title: string | null;
  /** Raw date string exactly as written; never reformatted on a round trip. */
  date: string | null;
  draft: boolean;
  tags: string[];
  /**
   * Every front-matter line we do not model, verbatim and in order.
   *
   * This is the anti-data-loss field. A theme's `categories`, `aliases`,
   * `weight` or custom key survives an edit because it is carried through as
   * text rather than parsed into a shape we would have to re-emit correctly.
   */
  extraLines: string[];
  /** Everything after the front matter block. */
  body: string;
}

/** The fields Mawkingbird owns and will rewrite. */
export interface FrontMatterFields {
  title: string;
  /** RFC 3339. The post's publish time, not the commit time. */
  date: string;
  draft: boolean;
  tags: string[];
}

/** Keys we parse and re-emit ourselves; everything else is an extra line. */
const OWNED_KEYS = new Set(['title', 'date', 'draft', 'tags']);

/**
 * Escape a TOML basic string.
 *
 * Backslash first, or it would double-escape the quotes we add after it.
 * Control characters become their TOML escapes rather than raw bytes, and a
 * title containing a newline is collapsed to a space by the caller — a
 * multi-line TOML string is legal but there is no reason to emit one from a
 * single-line title field.
 */
function tomlString(value: string): string {
  const escaped = value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\t', '\\t')
    .replaceAll('\r', '')
    .replaceAll('\n', ' ')
    // Anything else in the C0 range TOML would reject. Matching control
    // characters is the entire point here, hence the disable.
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  return `"${escaped}"`;
}

/** A YAML double-quoted scalar. Same escaping rules that matter to us. */
function yamlString(value: string): string {
  const escaped = value
    .replaceAll('\\', '\\\\')
    .replaceAll('"', '\\"')
    .replaceAll('\r', '')
    .replaceAll('\n', ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
  return `"${escaped}"`;
}

/**
 * Build a complete file: front matter block plus body.
 *
 * `extraLines` are emitted after the fields we own, unchanged. Passing the
 * `extraLines` from {@link parseFrontMatter} is what makes an edit lossless.
 */
export function serializeFrontMatter(
  fields: FrontMatterFields,
  body: string,
  format: FrontMatterFormat = 'toml',
  extraLines: string[] = [],
): string {
  const quote = format === 'toml' ? tomlString : yamlString;
  const sep = format === 'toml' ? ' = ' : ': ';
  const lines = [
    `title${sep}${quote(fields.title)}`,
    // Dates are bare in TOML (an RFC 3339 datetime is a native type) and
    // quoted in YAML, where an unquoted timestamp is a typed value some
    // parsers rewrite.
    `date${sep}${format === 'toml' ? fields.date : quote(fields.date)}`,
    `draft${sep}${fields.draft ? 'true' : 'false'}`,
  ];
  if (fields.tags.length) {
    lines.push(`tags${sep}[${fields.tags.map((t) => quote(t)).join(', ')}]`);
  }
  lines.push(...extraLines);

  const fence = format === 'toml' ? '+++' : '---';
  // Exactly one blank line between the block and the body, and a trailing
  // newline: what `hugo new` produces, and what diffs stay quiet against.
  return `${fence}\n${lines.join('\n')}\n${fence}\n\n${body.replace(/\s+$/, '')}\n`;
}

/** Strip one layer of matching quotes and undo the escapes we emit. */
function unquote(raw: string): string {
  const trimmed = raw.trim();
  const quoted =
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2);
  if (!quoted) {
    return trimmed;
  }
  const inner = trimmed.slice(1, -1);
  return trimmed.startsWith("'")
    ? inner
    : inner.replaceAll('\\"', '"').replaceAll('\\t', '\t').replaceAll('\\\\', '\\');
}

/** `["a", "b"]` → `['a', 'b']`. Tolerates a bare unbracketed single value. */
function parseArray(raw: string): string[] {
  const trimmed = raw.trim();
  const inner = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
  if (!inner.trim()) {
    return [];
  }
  return inner
    .split(',')
    .map((part) => unquote(part))
    .filter((part) => part.length > 0);
}

/**
 * Read a post file.
 *
 * A file with no recognizable front matter is not an error: it reads as
 * `missing: true` with the whole file as the body, which is exactly what the
 * post list wants to show for a stray Markdown file.
 */
export function parseFrontMatter(source: string): ParsedPost {
  // Tolerate a BOM and leading blank lines before the fence.
  const text = source.replace(/^\uFEFF/, '');
  const match = /^\s*(\+\+\+|---)\r?\n([\s\S]*?)\r?\n\1\r?\n?/.exec(text);
  if (!match) {
    return {
      format: 'toml',
      missing: true,
      title: null,
      date: null,
      draft: false,
      tags: [],
      extraLines: [],
      body: text.trim(),
    };
  }

  const format: FrontMatterFormat = match[1] === '+++' ? 'toml' : 'yaml';
  const body = text.slice(match[0].length);
  const parsed: ParsedPost = {
    format,
    missing: false,
    title: null,
    date: null,
    draft: false,
    tags: [],
    extraLines: [],
    body: body.replace(/^\s*\n/, '').replace(/\s+$/, ''),
  };

  for (const line of match[2].split(/\r?\n/)) {
    if (!line.trim()) {
      continue;
    }
    const kv = /^\s*([A-Za-z0-9_-]+)\s*[:=]\s*(.*)$/.exec(line);
    const key = kv?.[1]?.toLowerCase();
    if (!kv || !key || !OWNED_KEYS.has(key)) {
      // Unknown key, a nested YAML block, a comment — carried through as text.
      parsed.extraLines.push(line);
      continue;
    }
    const value = kv[2];
    if (key === 'title') {
      parsed.title = unquote(value);
    } else if (key === 'date') {
      parsed.date = unquote(value);
    } else if (key === 'draft') {
      parsed.draft = unquote(value).toLowerCase() === 'true';
    } else {
      parsed.tags = parseArray(value);
    }
  }
  return parsed;
}

/**
 * Hashtags in the body, as Hugo tags.
 *
 * Hugo's convention drops the `#`, so we do too, but the hashtags stay in the
 * body — that is what the author wrote. Deduplicated case-insensitively while
 * keeping the first spelling, and capped: a post that is mostly hashtags should
 * not produce forty taxonomy terms.
 */
export function tagsFromBody(body: string, limit = 8): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const match of body.matchAll(/(?:^|\s)#([\p{L}\p{N}_][\p{L}\p{N}_-]*)/gu)) {
    const tag = match[1];
    const key = tag.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    tags.push(tag);
    if (tags.length >= limit) {
      break;
    }
  }
  return tags;
}
