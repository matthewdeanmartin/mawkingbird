import { isMawkingbirdPage, isShareablePageUrl, panelUrl, withoutHash } from '../lib/links.js';
import { PANEL_CHANNEL, PANEL_VERSION, panelAccepted } from '../lib/protocol.js';
import { getBase, onBaseChanged } from '../lib/settings.js';

/**
 * The sidebar: Mawkingbird's /panel, loaded once, told which page is beside it.
 *
 * Each tab change is a `postMessage` to the panel, not a new address, so the
 * panel updates in place and the page's address never appears in a URL.
 *
 * Versions (protocol.json): the panel says `ready` with its version; this sends
 * its own with every page. A panel that never says `ready` (the site is older
 * than this sidebar, or mid-deploy) or is older than MIN_PANEL_VERSION gets a
 * plain "updating" notice with Try again, never a stuck or wrong panel.
 */

const FOLLOW_DELAY_MS = 300;
/** How long the panel has, after loading, to say `ready`. */
const READY_TIMEOUT_MS = 8000;

const frame = document.getElementById('panel');
const mismatch = document.getElementById('mismatch');
let base = await getBase();
let panelReady = false;
let shown = undefined;
let timer = null;
let readyTimer = null;

document.getElementById('retry').addEventListener('click', () => load());

window.addEventListener('message', (event) => {
  if (event.source !== frame.contentWindow || event.origin !== new URL(base).origin) return;
  if (event.data?.channel !== PANEL_CHANNEL || event.data.type !== 'ready') return;
  clearTimeout(readyTimer);
  if (!panelAccepted(event.data)) {
    showMismatch(true);
    return;
  }
  showMismatch(false);
  panelReady = true;
  shown = undefined;
  void follow(0);
});

frame.addEventListener('load', () => {
  clearTimeout(readyTimer);
  if (!panelReady) readyTimer = setTimeout(() => showMismatch(true), READY_TIMEOUT_MS);
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
  showMismatch(false);
  frame.src = panelUrl(base);
}

function showMismatch(on) {
  mismatch.hidden = !on;
  frame.hidden = on;
}

async function follow(delay = FOLLOW_DELAY_MS) {
  clearTimeout(timer);
  timer = setTimeout(async () => {
    if (!panelReady) return;
    const tab = await currentTab();
    // Mawkingbird's own tabs (Watch opened from the panel) keep the panel as is.
    if (tab && isMawkingbirdPage(base, tab.url) && shown !== undefined) return;
    const page =
      tab && isShareablePageUrl(tab.url) ? { url: withoutHash(tab.url), title: tab.title ?? '' } : null;
    const key = page ? `${page.url}\n${page.title}` : '';
    if (key === shown) return;
    shown = key;
    frame.contentWindow.postMessage(
      {
        channel: PANEL_CHANNEL,
        type: 'page',
        url: page?.url ?? null,
        title: page?.title ?? '',
        sidebarVersion: PANEL_VERSION,
      },
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
