// Keep remote documents out of the privileged WebView. Rust validates again.
(() => {
  if (window.top !== window) return;
  const activate = (event) => {
    if (!event.isTrusted || (event.type === 'auxclick' && event.button !== 1)) return;
    const anchor = event.composedPath().find((node) => node instanceof HTMLAnchorElement);
    if (!anchor) return;
    let target;
    try { target = new URL(anchor.href, location.href); } catch { return; }
    if (target.origin === location.origin && target.protocol === location.protocol) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (target.protocol === 'mailto:' && anchor.closest('app-bug-report-dialog')) {
      window.__TAURI__.core.invoke('open_feedback_email', {url: target.href})
        .catch(() => console.error('Could not open mail app'));
      return;
    }
    if (!['http:', 'https:'].includes(target.protocol)) return;
    window.__TAURI__.core.invoke('open_external', { url: target.href })
      .then(() => anchor.dispatchEvent(new Event('feedbackopened')))
      .catch(() => console.error('Could not open the system browser'));
  };
  document.addEventListener('click', activate, true);
  document.addEventListener('auxclick', activate, true);
})();
