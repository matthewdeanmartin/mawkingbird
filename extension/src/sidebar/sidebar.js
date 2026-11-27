import { isMawkingbirdPage, isShareablePageUrl, panelUrl, withoutHash } from '../lib/links.js';
import { getBase, onBaseChanged } from '../lib/settings.js';

/**
 * The sidebar: Mawkingbird's /panel, loaded once, told which page is beside it.
 *
 * Each tab change is a `postMessage` to the panel, not a new address, so the
 * panel updates in place (no reload, no blink, less network) and the page's
 * address never appears in a URL that a request could carry to a server.
 * Tabs on Mawkingbird itself leave the panel as it was (opening Watch from it).
 */

export const PANEL_CHANNEL = 'mawkingbird-panel/1';
const FOLLOW_DELAY_MS = 300;

const frame = document.getElementById('panel');
let base = await getBase();
let panelReady = false;
let shown = undefined;
let timer = null;

window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow || event.origin !== new URL(base).origin) return;
  if (event.data?.channel !== PANEL_CHANNEL || event.data.type !== 'ready') return;
  panelReady = true;
  shown = undefined;
  void follow(0);
});

onBaseChanged((next) => {
  base = next;
  load();
});

browser.tabs.onActivated.addListener(() => void follow());
browser.tabs.onUpdated.addListener((_id, change, tab) => {
  if (tab.active && (change.url || change.title || change.status === 'complete')) void follow();
});
load();

function load() {
  panelReady = false;
  shown = undefined;
  frame.src = panelUrl(base);
}

async function follow(delay = FOLLOW_DELAY_MS) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (!panelReady) return;
    const tab = await currentTab();
    // Mawkingbird's own tabs (Watch opened from the panel) keep the panel as is.
    if (tab && isMawkingbirdPage(base, tab.url) && shown !== undefined) return;
    const page = tab && isShareablePageUrl(tab.url) ? { url: withoutHash(tab.url), title: tab.title ?? '' } : null;
    const key = page ? `${page.url}\n${page.title}` : '';
    if (key === shown) return;
    shown = key;
    frame.contentWindow.postMessage(
      { channel: PANEL_CHANNEL, type: 'page', url: page?.url ?? null, title: page?.title ?? '' },
      new URL(base).origin,
    );
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
