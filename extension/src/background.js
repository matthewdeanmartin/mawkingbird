import {
  deepLinkFor,
  isShareablePageUrl,
  postsAboutUrl,
  quotedText,
  shareUrl,
  subscribeUrl,
} from './lib/links.js';
import { getBase } from './lib/settings.js';

/**
 * Right-click menus. Event page (Manifest V3): every listener is registered at
 * the top level so Firefox can wake the page for it. The toolbar button is a
 * popup (popup/), and Alt+Shift+M toggles the sidebar through the manifest.
 */

/** Pages and links the app can open as a post or profile (see lib/links.js). */
const SOCIAL_PATTERNS = [
  '*://*/@*',
  '*://*/users/*',
  '*://bsky.app/profile/*',
  '*://twitter.com/*',
  '*://mobile.twitter.com/*',
  '*://x.com/*',
  '*://mobile.x.com/*',
];

/** Links that look like a feed. A guess: Paste a link checks before subscribing. */
const FEED_LINK_PATTERNS = [
  '*://*/*.rss',
  '*://*/*.atom',
  '*://*/*.xml',
  '*://*/*/feed',
  '*://*/*/feed/',
  '*://*/feed',
  '*://*/feed/',
  '*://*/*/rss',
  '*://*/rss',
  '*://*/*feed.json',
];

const MENUS = [
  { id: 'share-page', title: 'Share this page in Mawkingbird', contexts: ['page'] },
  {
    id: 'open-page',
    title: 'Open in Mawkingbird',
    contexts: ['page'],
    documentUrlPatterns: SOCIAL_PATTERNS,
  },
  { id: 'posts-about-page', title: 'Posts about this page', contexts: ['page'] },
  { id: 'quote-selection', title: 'Quote “%s” in Mawkingbird', contexts: ['selection'] },
  {
    id: 'open-link',
    title: 'Open link in Mawkingbird',
    contexts: ['link'],
    targetUrlPatterns: SOCIAL_PATTERNS,
  },
  { id: 'posts-about-link', title: 'Posts about this link', contexts: ['link'] },
  {
    id: 'subscribe-link',
    title: 'Subscribe to this feed in Mawkingbird',
    contexts: ['link'],
    targetUrlPatterns: FEED_LINK_PATTERNS,
  },
  { id: 'subscribe-page', title: 'Subscribe to this site in Mawkingbird', contexts: ['page'] },
];

browser.runtime.onInstalled.addListener(async () => {
  await browser.contextMenus.removeAll();
  for (const menu of MENUS) browser.contextMenus.create(menu);
});

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  const base = await getBase();
  const pageUrl = info.pageUrl ?? tab?.url ?? '';
  const target = menuTarget(base, info, tab, pageUrl);
  if (target) await openBeside(tab, target);
});

function menuTarget(base, info, tab, pageUrl) {
  switch (info.menuItemId) {
    case 'share-page':
      return shareUrl(base, { title: tab?.title, url: pageUrl });
    case 'quote-selection':
      return shareUrl(base, {
        title: tab?.title,
        text: quotedText(info.selectionText),
        url: pageUrl,
      });
    case 'open-page':
      return deepLinkFor(base, pageUrl) ?? postsAbout(base, pageUrl);
    case 'posts-about-page':
      return postsAbout(base, pageUrl);
    case 'open-link':
      return deepLinkFor(base, info.linkUrl) ?? postsAbout(base, info.linkUrl);
    case 'posts-about-link':
      return postsAbout(base, info.linkUrl);
    case 'subscribe-link':
      return subscribeUrl(base, info.linkUrl);
    case 'subscribe-page':
      return subscribeUrl(base, pageUrl);
    default:
      return null;
  }
}

function postsAbout(base, url) {
  return isShareablePageUrl(url) ? postsAboutUrl(base, url) : null;
}

/** A new tab next to the one the reader was on. */
async function openBeside(tab, url) {
  const options = { url };
  if (tab && tab.id !== undefined && tab.id >= 0) {
    options.index = tab.index + 1;
    options.openerTabId = tab.id;
    options.windowId = tab.windowId;
  }
  await browser.tabs.create(options);
}
