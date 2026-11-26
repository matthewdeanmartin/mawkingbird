import { deepLinkPath, isShareablePageUrl, normalizeHandle } from './links.js';

/**
 * What a page offers Mawkingbird: its feeds and its author's fediverse handle.
 *
 * Two halves, so the interesting half is testable without a browser:
 *
 * - {@link collectPageFacts} runs *inside the page* via
 *   `scripting.executeScript`, only after the reader clicks the toolbar button
 *   (`activeTab`). It is serialised on its own, so it must not reference
 *   anything outside its body. It only reads tags and returns plain data.
 * - {@link interpretPageFacts} turns that data into what the popup shows.
 */

/** Caps so a hostile or huge page cannot flood the popup. */
const MAX_TAGS = 50;
const MAX_FEEDS = 5;
const MAX_AUTHORS = 3;
const MAX_SELECTION = 5000;

export function collectPageFacts() {
  const limit = 50;
  const take = (selector) => Array.from(document.querySelectorAll(selector)).slice(0, limit);
  const text = (value, max = 300) => String(value ?? '').trim().slice(0, max);
  return {
    url: location.href,
    title: text(document.title),
    selection: text(globalThis.getSelection?.(), 5000),
    alternates: take('link[rel~="alternate" i][href]').map((link) => ({
      type: text(link.getAttribute('type'), 100).toLowerCase(),
      href: link.href,
      title: text(link.getAttribute('title')),
    })),
    creators: take('meta[name="fediverse:creator" i][content]').map((meta) =>
      text(meta.getAttribute('content'), 200),
    ),
    relMe: take('a[rel~="me" i][href], link[rel~="me" i][href]').map((el) => el.href),
  };
}

const FEED_TYPES = new Set([
  'application/rss+xml',
  'application/atom+xml',
  'application/feed+json',
  'application/rdf+xml',
  'application/x-rss+xml',
  'text/xml',
]);

/** Feed titles that are rarely what a reader means by "this site's feed". */
const COMMENT_FEED = /\bcomments?\b/i;

/**
 * @returns {{
 *   url: string, title: string, selection: string,
 *   feeds: {url: string, title: string}[],
 *   authors: {handle: string, source: 'creator' | 'rel-me'}[],
 *   deepLinkable: boolean,
 * }}
 */
export function interpretPageFacts(facts) {
  const url = typeof facts?.url === 'string' ? facts.url : '';
  return {
    url,
    title: str(facts?.title, 300),
    selection: str(facts?.selection, MAX_SELECTION),
    feeds: feedsOf(list(facts?.alternates)),
    authors: authorsOf(list(facts?.creators), list(facts?.relMe)),
    deepLinkable: deepLinkPath(url) !== null,
  };
}

function feedsOf(alternates) {
  const seen = new Set();
  const feeds = [];
  const comments = [];
  for (const alt of alternates) {
    const href = str(alt?.href, 2048);
    if (!FEED_TYPES.has(str(alt?.type, 100).toLowerCase()) || !isShareablePageUrl(href)) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    const feed = { url: href, title: str(alt?.title, 120) };
    (COMMENT_FEED.test(feed.title) ? comments : feeds).push(feed);
  }
  // Comment feeds last: a blog's main feed is the usual intent.
  return [...feeds, ...comments].slice(0, MAX_FEEDS);
}

function authorsOf(creators, relMe) {
  const seen = new Set();
  const authors = [];
  const add = (handle, source) => {
    if (!handle || seen.has(handle.toLowerCase())) return;
    seen.add(handle.toLowerCase());
    authors.push({ handle, source });
  };
  for (const value of creators) add(normalizeHandle(str(value, 200)), 'creator');
  for (const href of relMe) {
    const path = deepLinkPath(str(href, 2048));
    // Only a profile (`@user@host`), not a post someone linked with rel=me.
    if (path?.startsWith('@')) add(normalizeHandle(path), 'rel-me');
  }
  return authors.slice(0, MAX_AUTHORS);
}

function list(value) {
  return Array.isArray(value) ? value.slice(0, MAX_TAGS) : [];
}

function str(value, max) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
