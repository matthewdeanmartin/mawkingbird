import { originPattern } from '../lib/bridge.js';
import { checkTarget } from '../lib/fetch-guard.js';

/**
 * "Let Mawkingbird read example.com?" Firefox grants a site only from a click
 * inside an extension page, which is why the app's request opens this window.
 * The answer goes back to the background, which answers the app.
 */

const params = new URLSearchParams(location.search);
const request = params.get('request') ?? '';
const target = checkTarget(params.get('origin'), 'article');
const message = document.getElementById('message');

if (!target.ok) {
  document.getElementById('site').textContent = 'this site';
  document.getElementById('allow').disabled = true;
  message.textContent = "That isn't a site Mawkingbird can read.";
} else {
  document.getElementById('site').textContent = new URL(target.origin).host;
}

document.getElementById('allow').addEventListener('click', () => {
  if (!target.ok) return;
  // Must be called directly in the click: no await before it.
  browser.permissions.request({ origins: [originPattern(target.origin)] }).then(
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
