// Runs on Mawkingbird's own pages only (manifest content_scripts, or the
// configured test/local address). Tells the app the bridge is here and relays
// its window.postMessage requests to the background, which decides everything.
// A classic script, not a module: content scripts are loaded that way.
(() => {
  const PROTOCOL = 'mawkingbird-extension/1';

  document.documentElement.dataset.mawkingbirdExtension = PROTOCOL;

  window.addEventListener('message', async (event) => {
    // Only this page's own scripts: not frames, not other windows or origins.
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.channel !== PROTOCOL || data.direction !== 'to-extension') return;
    if (typeof data.id !== 'string' || data.id.length > 100) return;
    let result;
    try {
      result = await browser.runtime.sendMessage({
        type: 'bridge',
        request: {
          op: data.op,
          url: data.url,
          purpose: data.purpose,
          origin: data.origin,
          endpoint: data.endpoint,
          body: data.body,
          headers: data.headers,
        },
      });
    } catch {
      result = { ok: false, error: 'unavailable', detail: 'The extension did not answer.' };
    }
    window.postMessage(
      { channel: PROTOCOL, direction: 'to-page', id: data.id, result },
      window.location.origin,
    );
  });

  window.postMessage({ channel: PROTOCOL, direction: 'to-page', id: 'ready' }, window.location.origin);
})();
