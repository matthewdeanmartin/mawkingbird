import { ALL_SITES, originPattern } from '../lib/bridge.js';
import { MAWKINGBIRD_BASES, normalizeBase } from '../lib/links.js';
import { getBase, setBase } from '../lib/settings.js';

const form = document.getElementById('form');
const custom = document.getElementById('custom');
const message = document.getElementById('message');

const current = await getBase();
const preset = Object.entries(MAWKINGBIRD_BASES).find(([, url]) => url === current)?.[0];
form.elements.base.value = preset ?? 'custom';
if (!preset) custom.value = current;

custom.addEventListener('focus', () => {
  form.elements.base.value = 'custom';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const choice = form.elements.base.value;
  const wanted = choice === 'custom' ? custom.value : MAWKINGBIRD_BASES[choice];
  if (!normalizeBase(wanted)) {
    message.textContent = 'Use an https:// address, or http://localhost for a local copy.';
    return;
  }
  const saved = await setBase(wanted);
  message.textContent = `Saved. Opening ${saved}`;
  await showCustomBridge(saved);
});

const customBridge = document.getElementById('custom-bridge');
const sites = document.getElementById('sites');
const noSites = document.getElementById('no-sites');
let customOrigin = null;

document.getElementById('allow-custom').addEventListener('click', () => {
  if (!customOrigin) return;
  // In the click itself: Firefox grants only from a user action.
  void browser.permissions
    .request({ origins: [originPattern(customOrigin)] })
    .then(() => Promise.all([showCustomBridge(customOrigin), listSites()]));
});

/** A custom address needs the reader's leave before the bridge runs there. */
async function showCustomBridge(base) {
  const origin = new URL(base).origin;
  customOrigin = origin === 'https://mawkingbird.com' ? null : origin;
  const granted =
    customOrigin && (await browser.permissions.contains({ origins: [originPattern(customOrigin)] }));
  customBridge.hidden = !customOrigin || granted;
}

/** Every site the reader has allowed, each with Remove. */
async function listSites() {
  const { origins = [] } = await browser.permissions.getAll();
  // Mawkingbird's own address is the extension's, not a site the reader allowed.
  const granted = origins
    .filter((pattern) => pattern !== '*://*/*' && pattern !== 'https://mawkingbird.com/*')
    .sort();
  sites.replaceChildren(
    ...granted.map((pattern) => {
      const item = document.createElement('li');
      const label = document.createElement('span');
      label.textContent = pattern.replace(/\/\*$/, '');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.addEventListener('click', async () => {
        await browser.permissions.remove({ origins: [pattern] });
        await listSites();
      });
      item.append(label, remove);
      return item;
    }),
  );
  noSites.hidden = granted.length > 0;
}

const allSites = document.getElementById('all-sites');
allSites.addEventListener('change', () => {
  // In the change event itself: Firefox grants only from a user action.
  const request = allSites.checked
    ? browser.permissions.request({ origins: [ALL_SITES] })
    : browser.permissions.remove({ origins: [ALL_SITES] }).then(() => false);
  void request.then(showAllSites, showAllSites);
});

async function showAllSites() {
  allSites.checked = await browser.permissions.contains({ origins: [ALL_SITES] });
}

await showCustomBridge(current);
await showAllSites();
await listSites();
