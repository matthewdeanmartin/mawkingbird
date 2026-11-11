/** One subscription to write out. Callers may pass richer records; only these fields are read. */
export interface OpmlSubscription {
  url: string;
  title: string;
  /** Display folder name, written back as one `<outline>` level. Empty or absent means top level. */
  folder?: string;
}

/** One feed read out of an OPML file. */
export interface OpmlFeed {
  url: string;
  title: string;
  /**
   * The folder path this feed sat under, outermost first, or empty when it sat
   * at the top level.
   *
   * Kept as the full path here rather than pre-joined, because the parser's job is to report
   * what the file said and the depth cap is a display decision.
   */
  folders: string[];
}

/** Everything an OPML file told us. */
export interface ParsedOpml {
  title: string | null;
  feeds: OpmlFeed[];
}

/**
 * Read an OPML subscription list.
 *
 * OPML is a loose format and real files in the wild are worse than the spec:
 * exports from different readers disagree about which attribute holds the feed
 * URL, whether `type="rss"` is present at all, and how deeply outlines nest. So
 * this is deliberately permissive — anything with a usable `xmlUrl` counts as a
 * feed, whatever else the element claims about itself, and anything without one
 * is treated as a folder and descended into.
 *
 * Throws with a message meant to be shown verbatim when the file is not OPML.
 */
export function parseOpml(xml: string): ParsedOpml {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  if (doc.querySelector('parsererror')) {
    throw new Error('Not valid XML — is this really an OPML file?');
  }
  const root = doc.documentElement;
  if (root.localName.toLowerCase() !== 'opml') {
    throw new Error(`Expected an <opml> document, found <${root.localName}>.`);
  }

  const body = [...root.children].find((el) => el.localName.toLowerCase() === 'body');
  if (!body) {
    throw new Error('OPML document has no <body>.');
  }

  const feeds: OpmlFeed[] = [];
  const seen = new Set<string>();
  collect(body, [], feeds, seen);

  const head = [...root.children].find((el) => el.localName.toLowerCase() === 'head');
  const title =
    [...(head?.children ?? [])]
      .find((el) => el.localName.toLowerCase() === 'title')
      ?.textContent?.trim() || null;

  return { title, feeds };
}

/** Walk outlines depth-first, tracking the folder path as we descend. */
function collect(parent: Element, folders: string[], out: OpmlFeed[], seen: Set<string>): void {
  for (const el of parent.children) {
    if (el.localName.toLowerCase() !== 'outline') {
      continue;
    }
    const url = (el.getAttribute('xmlUrl') ?? el.getAttribute('xmlurl') ?? '').trim();
    const label = (el.getAttribute('text') ?? el.getAttribute('title') ?? '').trim();

    if (url && isFetchable(url)) {
      // A file that lists the same feed under two folders is common (and legal).
      // Keep the first, so the import count matches what actually gets added.
      if (!seen.has(url)) {
        seen.add(url);
        out.push({ url, title: label || url, folders: [...folders] });
      }
      continue;
    }
    // No usable URL: treat it as a folder, whatever it calls itself, and keep
    // descending. Some exporters nest feeds under a titleless outline.
    collect(el, label ? [...folders, label] : folders, out, seen);
  }
}

/**
 * Only http(s). An OPML file is untrusted input that we are about to turn into
 * fetches, and a `javascript:` or `file:` "feed" has no business reaching that
 * code even if the fetch would fail anyway.
 */
function isFetchable(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'https:' || protocol === 'http:';
  } catch {
    return false;
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** One `<outline type="rss">` line, indented to its depth in the tree. */
function feedOutline(feed: OpmlSubscription, indent: string): string {
  const text = escapeXml(feed.title || feed.url);
  return `${indent}<outline type="rss" text="${text}" title="${text}" xmlUrl="${escapeXml(feed.url)}" />`;
}

/**
 * Write subscriptions out as OPML, nesting filed feeds under their folder.
 *
 * An export that flattened the tree would undo the import that built it, so
 * folders are kept. Unfiled feeds stay at the top level. Folder names are written
 * back as the display string, `Tech / Rust` included: re-importing re-derives the
 * same single folder from it. Rebuilding real nested levels would split one
 * folder someone named with a slash into two, and this model cannot tell those
 * cases apart. Every subscription passed in is written; filtering is the caller's
 * choice.
 */
export function buildOpml(
  feeds: readonly OpmlSubscription[],
  now = new Date(),
  title = 'Subscriptions',
): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    `    <title>${escapeXml(title)}</title>`,
    `    <dateCreated>${escapeXml(now.toUTCString())}</dateCreated>`,
    '  </head>',
    '  <body>',
  ];

  // Unfiled feeds first, at the top level, then one <outline> per folder. Order
  // within each group follows the subscription list, so an export reads in the
  // order the app shows.
  for (const feed of feeds.filter((f) => !f.folder)) {
    lines.push(feedOutline(feed, '    '));
  }

  const byFolder = new Map<string, OpmlSubscription[]>();
  for (const feed of feeds) {
    if (feed.folder) {
      byFolder.set(feed.folder, [...(byFolder.get(feed.folder) ?? []), feed]);
    }
  }
  for (const [folder, filed] of byFolder) {
    const text = escapeXml(folder);
    lines.push(`    <outline text="${text}" title="${text}">`);
    for (const feed of filed) {
      lines.push(feedOutline(feed, '      '));
    }
    lines.push('    </outline>');
  }

  lines.push('  </body>', '</opml>', '');
  return lines.join('\n');
}
