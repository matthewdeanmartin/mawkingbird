import { isShareablePageUrl, panelUrl, withoutHash } from '../lib/links.js';
import { getBase, onBaseChanged } from '../lib/settings.js';

/**
 * The sidebar: Mawkingbird's /panel about the tab beside it (write about the
 * page, your posts about it, other people's). It follows the active tab, but
 * reloads only when the page itself changes (not its #fragment), after a short
 * pause, so flicking through tabs doesn't fire a burst of API calls.
 */

const FOLLOW_DELAY_MS = 700;

const frame = document.getElementById('panel');
const label = document.getElementById('page-label');
document.getElementById('open-full').addEventListener('click', () => {
  void browser.tabs.create({ url: base });
});

let base = await getBase();
let shownFor = null;
let timer = null;

onBaseChanged((next) => {
  base = next;
  shownFor = null;
  void follow(0);
});

browser.tabs.onActivated.addListener(() => void follow());
browser.tabs.onUpdated.addListener((_id, change, tab) => {
  if (tab.active && (change.url || change.status === 'complete')) void follow();
});
void follow(0);

async function follow(delay = FOLLOW_DELAY_MS) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const tab = await currentTab();
    const page = tab && isShareablePageUrl(tab.url) ? withoutHash(tab.url) : '';
    label.textContent = page ? hostOf(page) : '';
    if (page === shownFor) return;
    shownFor = page;
    frame.src = panelUrl(base, { url: page, title: tab?.title });
  }, delay);
}

async function currentTab() {
  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    return tab ?? null;
  } catch {
    return null;
  }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
