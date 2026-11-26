import { isShareablePageUrl, liteUrl, postsAboutUrl, shareUrl } from '../lib/links.js';
import { getBase, onBaseChanged } from '../lib/settings.js';

/**
 * The sidebar: Lite in a frame, and a strip that acts on the tab beside it.
 *
 * Share and Posts about it load in the frame, so the reader stays in the
 * sidebar. /share lands on the full app's Home composer (Lite's quick composer
 * does not take a shared draft yet: spec/firefox-extension.md, W-1).
 */

const frame = document.getElementById('lite');
const status = document.getElementById('status');
const shareButton = document.getElementById('share');
const postsButton = document.getElementById('posts-about');
const openFullButton = document.getElementById('open-full');

let base = await getBase();
frame.src = liteUrl(base);

onBaseChanged((next) => {
  base = next;
  frame.src = liteUrl(base);
});

shareButton.addEventListener('click', async () => {
  const tab = await activeTab();
  if (!tab) return;
  frame.src = shareUrl(base, { title: tab.title, url: tab.url });
});

postsButton.addEventListener('click', async () => {
  const tab = await activeTab();
  if (!tab) return;
  frame.src = postsAboutUrl(base, tab.url);
});

openFullButton.addEventListener('click', () => {
  void browser.tabs.create({ url: base });
});

// Keep the buttons honest about the tab beside the sidebar.
browser.tabs.onActivated.addListener(() => void refresh());
browser.tabs.onUpdated.addListener((_id, change) => {
  if (change.url || change.status === 'complete') void refresh();
});
void refresh();

async function refresh() {
  const tab = await currentTab();
  const usable = Boolean(tab && isShareablePageUrl(tab.url));
  shareButton.disabled = !usable;
  postsButton.disabled = !usable;
  setStatus(usable ? '' : 'Open a web page to share it.');
}

/** The tab beside the sidebar, if it is a page that can be shared. */
async function activeTab() {
  const tab = await currentTab();
  if (tab && isShareablePageUrl(tab.url)) return tab;
  setStatus('Open a web page to share it.');
  return null;
}

async function currentTab() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab ?? null;
  } catch {
    return null;
  }
}

function setStatus(text) {
  status.textContent = text;
  status.hidden = !text;
}
