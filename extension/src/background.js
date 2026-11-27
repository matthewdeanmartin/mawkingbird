import {
  deepLinkFor,
  isShareablePageUrl,
  postsAboutUrl,
  quotedText,
  shareUrl,
  subscribeUrl,
  watchUrl,
  youtubeVideoId,
} from './lib/links.js';
import { fromMawkingbird, handleBridgeRequest, originPattern } from './lib/bridge.js';
import { getBase, onBaseChanged } from './lib/settings.js';

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
      // A YouTube video subscribes through Watch's channel panel.
      return watchUrl(base, youtubeVideoId(pageUrl)) ?? subscribeUrl(base, pageUrl);
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

// --- Bridge (spec/firefox-extension.md, sprint 5) ----------------------------
// mawkingbird.com asks, through bridge/content.js, for public pages its own
// requests can't reach. The background decides: fetch-guard rules, then the
// reader's per-site permission, which only a click in grant/ can give.

/** Requests waiting for the reader in a grant window: id → { resolve, windowId }. */
const pendingGrants = new Map();

browser.runtime.onMessage.addListener((message, sender) => {
  if (sender.id !== browser.runtime.id) return undefined;
  if (message?.type === 'bridge') return answerBridge(message.request, sender);
  if (message?.type === 'grant-answer') {
    // Only the grant window itself, an extension page with no tab.
    if (!sender.url?.startsWith(browser.runtime.getURL('grant/'))) return undefined;
    settleGrant(message.request, message.granted === true);
    return Promise.resolve(true);
  }
  return undefined;
});

browser.windows.onRemoved.addListener((windowId) => {
  for (const [id, pending] of pendingGrants) {
    if (pending.windowId === windowId) settleGrant(id, false);
  }
});

async function answerBridge(request, sender) {
  const base = await getBase();
  // A content script on any page but the configured Mawkingbird is ignored.
  if (!sender.tab || !fromMawkingbird(sender.url ?? '', base)) {
    return { ok: false, error: 'refused', detail: 'Not from Mawkingbird.' };
  }
  return handleBridgeRequest(request, {
    fetch: (url, init) => fetch(url, init),
    hasPermission: (pattern) => browser.permissions.contains({ origins: [pattern] }),
    requestAccess: (origin) => askForAccess(origin),
  });
}

/** Opens the grant window and resolves with the reader's answer (false if closed). */
async function askForAccess(origin) {
  const id = crypto.randomUUID();
  const url = browser.runtime.getURL(
    `grant/grant.html?${new URLSearchParams({ origin, request: id })}`,
  );
  const answer = new Promise((resolve) => pendingGrants.set(id, { resolve, windowId: null }));
  const created = await browser.windows.create({ type: 'popup', url, width: 440, height: 320 });
  const pending = pendingGrants.get(id);
  if (pending) pending.windowId = created.id;
  return answer;
}

function settleGrant(id, granted) {
  const pending = pendingGrants.get(id);
  if (!pending) return;
  pendingGrants.delete(id);
  pending.resolve(granted);
}

// The manifest covers https://mawkingbird.com (production, canary, test). A
// custom address (a local dev server) gets the bridge only once the reader has
// allowed that address in Options.
const CUSTOM_SCRIPT_ID = 'bridge-custom-base';

async function registerBridgeFor(base) {
  try {
    await browser.scripting.unregisterContentScripts({ ids: [CUSTOM_SCRIPT_ID] });
  } catch {
    // nothing registered yet
  }
  const origin = new URL(base).origin;
  if (origin === 'https://mawkingbird.com') return;
  if (!(await browser.permissions.contains({ origins: [originPattern(origin)] }))) return;
  await browser.scripting.registerContentScripts([
    {
      id: CUSTOM_SCRIPT_ID,
      matches: [originPattern(origin)],
      js: ['bridge/content.js'],
      runAt: 'document_start',
      persistAcrossSessions: true,
    },
  ]);
}

browser.runtime.onStartup.addListener(async () => registerBridgeFor(await getBase()));
browser.runtime.onInstalled.addListener(async () => registerBridgeFor(await getBase()));
browser.permissions.onAdded.addListener(async () => registerBridgeFor(await getBase()));
onBaseChanged((base) => void registerBridgeFor(base));
