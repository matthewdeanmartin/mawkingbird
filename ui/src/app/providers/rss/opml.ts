import { RssFeedSub } from './rss-subscriptions';

/** One feed read out of an OPML file. */
export interface OpmlFeed {
  url: string;
  title: string;
  /**
   * The folder path this feed sat under, outermost first, or empty when it sat
   * at the top level.
   *
   * Consumed since RSS Sprint 2: the importer turns this into `RssFeedSub.folder`
   * via `folderPathToName`, and the left rail on `/rss` groups by it. Kept as the
   * full path here rather than pre-joined, because the parser's job is to report
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
function feedOutline(feed: RssFeedSub, indent: string): string {
  const text = escapeXml(feed.title || feed.url);
  return `${indent}<outline type="rss" text="${text}" title="${text}" xmlUrl="${escapeXml(feed.url)}" />`;
}

/**
 * Write the subscriptions out as OPML, nesting filed feeds under their folder.
 *
 * The export is what makes this list portable rather than hostage to one
 * browser's localStorage, so it has to carry the user's own organisation too —
 * an export that flattened the tree would quietly undo the import that built it,
 * and a round trip through Mawkingbird would cost someone their folders. Unfiled
 * feeds stay at the top level, which is also the entire file for anyone who has
 * never used a folder.
 *
 * Folder names are written back as the stored display string, `Tech / Rust`
 * included: re-importing re-derives the same single folder from it. Reconstructing
 * real nested `<outline>` levels would round-trip more prettily into *other*
 * readers, but it would also silently split one folder someone named with a slash
 * into two, and this model has no way to tell those cases apart.
 *
 * Disabled feeds are included. "Disabled" is a Mawkingbird display state, not a
 * statement that you are no longer subscribed, and dropping them would make an
 * export quietly lossy in a way nobody would notice until they reimported.
 */
export function buildOpml(feeds: readonly RssFeedSub[], now = new Date()): string {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    '    <title>Mawkingbird subscriptions</title>',
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

  const byFolder = new Map<string, RssFeedSub[]>();
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

/** A filename that sorts usefully and says where it came from. */
export function opmlFilename(now = new Date()): string {
  return `mawkingbird-feeds-${now.toISOString().slice(0, 10)}.opml`;
}
