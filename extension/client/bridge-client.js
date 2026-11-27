/**
 * The page side of the Mawkingbird for Firefox bridge, for the web app to adopt
 * (spec/firefox-extension.md, W-3). Dependency-free, no build step. Not shipped
 * in the extension: it runs on mawkingbird.com. Protocol: ./PROTOCOL.md.
 *
 *   if (extensionPresent()) {
 *     const page = await extensionFetch('https://blog.example/feed', 'feed');
 *     if (!page.ok && page.error === 'needs-access') await requestAccess(page.origin);
 *   }
 */

export const PROTOCOL = 'mawkingbird-extension/1';

/** Answers can wait on the reader (the grant window), so allow them time. */
const ANSWER_TIMEOUT_MS = 120_000;

/** Whether the extension's content script has marked this page. */
export function extensionPresent(doc = globalThis.document) {
  return doc?.documentElement?.dataset?.mawkingbirdExtension === PROTOCOL;
}

/**
 * A public page or feed, read by the extension from the reader's computer.
 * Resolves `{ ok: true, status, finalUrl, contentType, body }` or
 * `{ ok: false, error, detail?, origin? }`; `error` is one of `needs-access`
 * (ask with {@link requestAccess}), `refused`, `network`, `timeout`, `type`,
 * `too-large`, `unavailable`.
 *
 * @param {string} url
 * @param {'feed' | 'article' | 'json'} purpose
 */
export function extensionFetch(url, purpose) {
  return ask({ op: 'fetch', url, purpose });
}

/** Whether the reader already lets the extension read `origin`. */
export async function hasAccess(origin) {
  const answer = await ask({ op: 'hasAccess', origin });
  return answer.ok === true && answer.granted === true;
}

/**
 * Asks the reader, in a small extension window, to let it read `origin`.
 * Call it from a click: the reader should know why a window opened.
 */
export async function requestAccess(origin) {
  const answer = await ask({ op: 'requestAccess', origin });
  return answer.ok === true && answer.granted === true;
}

let counter = 0;

function ask(request, win = globalThis.window) {
  if (!extensionPresent()) {
    return Promise.resolve({ ok: false, error: 'unavailable', detail: 'No extension.' });
  }
  const id = `mb-${Date.now().toString(36)}-${(counter += 1)}`;
  return new Promise((resolve) => {
    const done = (result) => {
      win.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(result);
    };
    const onMessage = (event) => {
      const data = event.data;
      if (event.source !== win || event.origin !== win.location.origin) return;
      if (data?.channel !== PROTOCOL || data.direction !== 'to-page' || data.id !== id) return;
      done(data.result ?? { ok: false, error: 'unavailable' });
    };
    const timer = setTimeout(
      () => done({ ok: false, error: 'unavailable', detail: 'No answer.' }),
      ANSWER_TIMEOUT_MS,
    );
    win.addEventListener('message', onMessage);
    win.postMessage({ channel: PROTOCOL, direction: 'to-extension', id, ...request }, win.location.origin);
  });
}
