import { ALL_SITES, originPattern } from '../lib/bridge.js';
import { checkTarget } from '../lib/fetch-guard.js';

/**
 * "Let Mawkingbird read example.com?" Firefox grants a site only from a click
 * inside an extension page, which is why the app's request opens this window.
 * The answer goes back to the background, which answers the app.
 */

const params = new URLSearchParams(location.search);
const request = params.get('request') ?? '';
/** `*`: the "any public site" switch, for the bulk RSS features. */
const allSites = params.get('origin') === '*';
const target = allSites ? { ok: true } : checkTarget(params.get('origin'), 'article');
const message = document.getElementById('message');

if (allSites) {
  document.getElementById('site').textContent = 'any public site';
  document.getElementById('about').textContent =
    'Mawkingbird will read feeds and pages from any public website for you, from your own ' +
    "computer, without sending your cookies or signing in. It still won't read your home " +
    'network or local addresses. This lets it check many sites at once, such as your ' +
    "friends' blogs.";
} else if (!target.ok) {
  document.getElementById('site').textContent = 'this site';
  document.getElementById('allow').disabled = true;
  message.textContent = "That isn't a site Mawkingbird can read.";
} else {
  document.getElementById('site').textContent = new URL(target.origin).host;
}

document.getElementById('allow').addEventListener('click', () => {
  if (!target.ok) return;
  const origins = [allSites ? ALL_SITES : originPattern(target.origin)];
  // Must be called directly in the click: no await before it.
  browser.permissions.request({ origins }).then(
    (granted) => answer(granted),
    () => answer(false),
  );
});

document.getElementById('deny').addEventListener('click', () => answer(false));

async function answer(granted) {
  try {
    await browser.runtime.sendMessage({ type: 'grant-answer', request, granted });
  } finally {
    window.close();
  }
}
