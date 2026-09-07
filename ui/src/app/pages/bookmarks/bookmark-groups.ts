import { Status } from '../../models';

/** A machine-computed shelf of the bookmark library. */
export interface BookmarkGroup {
  /** Shelf heading, e.g. "@alice" or "#cats". */
  label: string;
  statuses: Status[];
}

/** The post a bookmark points at (bookmarking a boost saves the original). */
function target(status: Status): Status {
  return status.reblog ?? status;
}

/** Group bookmarks by author, largest shelf first, ties by label. */
export function groupByAuthor(statuses: Status[]): BookmarkGroup[] {
  const groups = new Map<string, BookmarkGroup>();
  for (const s of statuses) {
    const acct = target(s).account.acct;
    const group = groups.get(acct) ?? { label: `@${acct}`, statuses: [] };
    group.statuses.push(s);
    groups.set(acct, group);
  }
  return sortGroups([...groups.values()]);
}

/**
 * Group bookmarks by hashtag, largest shelf first. A post appears under every
 * hashtag it carries; posts without hashtags are collected under "no hashtags".
 */
export function groupByHashtag(statuses: Status[]): BookmarkGroup[] {
  const groups = new Map<string, BookmarkGroup>();
  const untagged: Status[] = [];
  for (const s of statuses) {
    const tags = extractHashtags(target(s).content);
    if (!tags.length) {
      untagged.push(s);
      continue;
    }
    for (const tag of tags) {
      const group = groups.get(tag) ?? { label: `#${tag}`, statuses: [] };
      group.statuses.push(s);
      groups.set(tag, group);
    }
  }
  const sorted = sortGroups([...groups.values()]);
  if (untagged.length) {
    sorted.push({ label: 'no hashtags', statuses: untagged });
  }
  return sorted;
}

/** Bookmarks whose target post carries media attachments. */
export function withMedia(statuses: Status[]): Status[] {
  return statuses.filter((s) => target(s).media_attachments.length > 0);
}

/** Pull lowercase hashtags out of a status's rendered HTML content. */
export function extractHashtags(content: string): string[] {
  const text = content.replace(/<[^>]*>/g, ' ');
  const tags = new Set<string>();
  for (const match of text.matchAll(/#([\p{L}\p{N}_]+)/gu)) {
    tags.add(match[1].toLowerCase());
  }
  return [...tags];
}

function sortGroups(groups: BookmarkGroup[]): BookmarkGroup[] {
  return groups.sort(
    (a, b) => b.statuses.length - a.statuses.length || a.label.localeCompare(b.label),
  );
}
