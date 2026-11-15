// Native media sinks only. Provider models, saved URLs and browser builds stay unchanged.
(() => {
  if (window.top !== window) return;
  const base = location.protocol === 'http:'
    ? 'http://native-media.localhost/' : 'native-media://localhost/';
  const map = (raw) => {
    try {
      const url = new URL(raw, document.baseURI);
      if (!['http:', 'https:'].includes(url.protocol) || url.origin === location.origin ||
          url.hostname === 'native-media.localhost') return raw;
      return base + '?url=' + encodeURIComponent(url.href);
    } catch { return raw; }
  };
  // Property writes cover Angular bindings and detached new Audio() players.
  for (const prototype of [HTMLMediaElement.prototype, HTMLSourceElement.prototype]) {
    const original = Object.getOwnPropertyDescriptor(prototype, 'src');
    if (original?.set && original.configurable) {
      Object.defineProperty(prototype, 'src', { ...original,
        set(value) { original.set.call(this, map(String(value))); } });
    }
  }
  const AudioConstructor = window.Audio;
  window.Audio = function Audio(url) {
    return url === undefined ? new AudioConstructor() : new AudioConstructor(map(String(url)));
  };
  window.Audio.prototype = AudioConstructor.prototype;
  const originalAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function(name, value) {
    if (String(name).toLowerCase() === 'src' && ['VIDEO', 'AUDIO', 'SOURCE'].includes(this.tagName)) {
      value = map(String(value));
    }
    return originalAttribute.call(this, name, value);
  };
  const reload = new Set();
  const adapt = (element) => {
    if (!['VIDEO', 'AUDIO', 'SOURCE'].includes(element.tagName)) return;
    const raw = element.getAttribute('src');
    if (!raw) return;
    const mapped = map(raw);
    if (raw !== mapped) {
      originalAttribute.call(element, 'src', mapped);
      if (element.tagName === 'SOURCE' && element.parentElement instanceof HTMLMediaElement) {
        reload.add(element.parentElement);
      }
    }
  };
  const scan = (node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    adapt(node);
    node.querySelectorAll('video[src], audio[src], source[src]').forEach(adapt);
  };
  new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') adapt(record.target);
      else record.addedNodes.forEach(scan);
    }
    for (const element of reload) element.load();
    reload.clear();
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ['src'] });
  document.addEventListener('error', (event) => {
    if (event.target instanceof HTMLMediaElement) {
      window.__TAURI__?.core.invoke('report_native_event', { event: 'media_error' }).catch(() => {});
    }
  }, true);
  if (document.documentElement) scan(document.documentElement);
})();
