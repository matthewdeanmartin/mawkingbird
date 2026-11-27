import {
  accountUrl,
  deepLinkFor,
  isShareablePageUrl,
  postsAboutUrl,
  quotedText,
  shareUrl,
  subscribeUrl,
  watchUrl,
  youtubeVideoId,
} from '../lib/links.js';
import { collectPageFacts, interpretPageFacts } from '../lib/page-scan.js';
import { getBase } from '../lib/settings.js';

/**
 * The toolbar popup. Opening it is the click that grants `activeTab`, so this is
 * the only moment the extension reads the page: once, for its feeds, author and
 * selection. Pages Firefox protects (about:, the add-ons site) can't be read;
 * the popup then offers what works without reading.
 */

const pageActions = document.getElementById('page-actions');
const feedActions = document.getElementById('feed-actions');
const authorActions = document.getElementById('author-actions');
const note = document.getElementById('note');

document.getElementById('sidebar').addEventListener('click', () => {
  // Must run inside the click itself (a user action), before any await.
  void browser.sidebarAction.open();
  window.close();
});

const base = await getBase();
const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

document.getElementById('open-app').addEventListener('click', () => open(base));

await render();

async function render() {
  if (!tab || !isShareablePageUrl(tab.url)) {
    showNote('Open a web page to share it or find its feeds.');
    return;
  }
  const page = interpretPageFacts(await readPage(tab) ?? { url: tab.url, title: tab.title });
  if (!page.title) page.title = tab.title ?? '';

  addAction(pageActions, 'Share this page', shareUrl(base, page));
  if (page.selection) {
    addAction(
      pageActions,
      'Quote the selection',
      shareUrl(base, { ...page, text: quotedText(page.selection) }),
      page.selection,
    );
  }
  if (page.deepLinkable) addAction(pageActions, 'Open in Mawkingbird', deepLinkFor(base, page.url));
  addAction(pageActions, 'Posts about this page', postsAboutUrl(base, page.url));

  show('feeds-section');
  const video = youtubeVideoId(page.url);
  if (video) {
    // A video page lists no feed; Watch finds the channel and subscribes to it.
    addAction(
      feedActions,
      'Subscribe to this channel',
      watchUrl(base, video),
      'Opens the video in Watch, where you can subscribe to its channel',
    );
  } else if (page.feeds.length) {
    for (const feed of page.feeds) {
      addAction(feedActions, `Subscribe: ${feed.title || hostOf(feed.url)}`, subscribeUrl(base, feed.url), feed.url);
    }
  } else {
    // Paste a link probes the site itself (common feed paths, the home page).
    addNote(feedActions, "This page doesn't list a feed.");
    addAction(feedActions, 'Look for one on this site', subscribeUrl(base, page.url));
  }

  if (page.authors.length) {
    show('authors-section');
    for (const author of page.authors) {
      addAction(authorActions, `@${author.handle}`, accountUrl(base, author.handle), 'Open their profile to follow');
    }
  }
}

/** The page's facts, or null when Firefox does not let extensions read it. */
async function readPage(target) {
  try {
    const [injection] = await browser.scripting.executeScript({
      target: { tabId: target.id },
      func: collectPageFacts,
    });
    return injection?.result ?? null;
  } catch {
    showNote("Firefox doesn't let add-ons read this page, so feeds and authors aren't shown.");
    return null;
  }
}

function addAction(list, label, url, detail) {
  if (!url) return;
  const item = document.createElement('li');
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  if (detail) button.title = detail;
  button.addEventListener('click', () => open(url));
  item.append(button);
  list.append(item);
}

function addNote(list, text) {
  const item = document.createElement('li');
  item.className = 'detail';
  item.textContent = text;
  list.append(item);
}

/** A new tab beside the current one, then close the popup. */
async function open(url) {
  const options = { url };
  if (tab?.id !== undefined && tab.id >= 0) {
    options.index = tab.index + 1;
    options.openerTabId = tab.id;
  }
  await browser.tabs.create(options);
  window.close();
}

function show(id) {
  document.getElementById(id).hidden = false;
}

function showNote(text) {
  note.textContent = text;
  note.hidden = false;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
