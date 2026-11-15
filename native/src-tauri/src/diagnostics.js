(() => {
  if (window.top !== window) return;
  const report = (event) => window.__TAURI__?.core.invoke('report_native_event', { event }).catch(() => {});
  window.addEventListener('error', () => report('renderer_error'));
  window.addEventListener('unhandledrejection', () => report('renderer_rejection'));
})();
