// Native presentation adapter. Keep the shared Angular model/serialized URLs intact.
// This changes image sinks only; it does not patch fetch, navigation, or provider data.
(() => {
  if (window.top !== window) return;
  const base = location.protocol === 'http:'
    ? 'http://native-image.localhost/' : 'native-image://localhost/';
  const imageUrl = (raw) => {
    try {
      const url = new URL(raw, document.baseURI);
      if (!['https:', 'http:'].includes(url.protocol) || url.origin === location.origin || url.hostname === 'native-image.localhost') return raw;
      return `${base}?url=${encodeURIComponent(url.href)}`;
    } catch { return raw; }
  };
  const attribute = (element, name) => {
    const original = element.getAttribute(name);
    if (!original) return;
    const mapped = imageUrl(original);
    if (mapped !== original) element.setAttribute(name, mapped);
  };
  const adapt = (element) => {
    if (element.tagName === 'IMG') attribute(element, 'src');
    if (element.tagName === 'VIDEO') attribute(element, 'poster');
    if (element.tagName === 'IMG' || (element.tagName === 'SOURCE' && element.parentElement?.tagName === 'PICTURE')) {
      const srcset = element.getAttribute('srcset');
      if (srcset && !srcset.includes('data:')) {
        const mapped = srcset.replace(/https?:\/\/[^\s,]+/g, imageUrl);
        if (mapped !== srcset) element.setAttribute('srcset', mapped);
      }
    }
    const background = element.style?.backgroundImage;
    if (background?.includes('url(')) {
      const mapped = background.replace(/url\(\s*(["']?)(.*?)\1\s*\)/g, (whole, _quote, raw) => {
        const url = imageUrl(raw);
        return url === raw ? whole : `url("${url}")`;
      });
      if (mapped !== background) element.style.backgroundImage = mapped;
    }
  };
  const scan = (node) => {
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    adapt(node);
    node.querySelectorAll('img, video[poster], picture source[srcset], [style]').forEach(adapt);
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === 'attributes') adapt(record.target);
      else record.addedNodes.forEach(scan);
    }
  });
  observer.observe(document, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['src', 'srcset', 'poster', 'style'] });
  if (document.documentElement) scan(document.documentElement);
})();
