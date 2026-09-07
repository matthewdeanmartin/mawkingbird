/**
 * Pre-app bootstrap. Loaded synchronously from index.html, ahead of the Angular
 * bundle, so the deep-link restore lands before the router reads `location`.
 *
 * This lives in its own file rather than inline in index.html so the page can
 * ship a Content-Security-Policy with `script-src 'self'` and no
 * `'unsafe-inline'` — an inline block would force either `'unsafe-inline'`
 * (which gives up most of the protection) or a hash that silently breaks the
 * page whenever the script is edited.
 */
(function () {
  /**
   * SPA deep-link restore. GitHub Pages' single root 404.html
   * (404-subpath-redirect.html) bounces an unknown deep link to the owning
   * app's index with the original path stashed as ?spa=…; restore it into
   * history so refreshing or chunk-reloading a deep URL lands back on that same
   * route (and on the right deployment — /canary/… stays under /canary/).
   */
  var params = new URLSearchParams(window.location.search);
  var target = params.get('spa');
  // Same-origin absolute path only: one leading "/" followed by something that
  // is neither "/" nor "\". Both would be read as a protocol-relative
  // cross-origin URL — URL parsers fold "\" to "/", so "/\evil.example" is
  // "//evil.example". replaceState would reject that with a SecurityError
  // rather than navigate, but rejecting it here keeps the failure quiet and
  // the intent obvious.
  if (target && target.charAt(0) === '/' && target.charAt(1) !== '/' && target.charAt(1) !== '\\') {
    history.replaceState(null, '', target);
  }

  /**
   * Mark the /test/ deployment on <html>, before anything paints.
   *
   * Done here rather than in the Angular bundle so the grey background is
   * present from the first frame: applying it after bootstrap would show a
   * white page that turns grey, which reads as a rendering bug rather than a
   * deliberate signal. It also survives the bundle failing to load — a broken
   * test deployment still looks like the test deployment, which is exactly
   * when knowing where you are matters most.
   *
   * The <base> element is the signal, matching `isTestBuild()` in
   * build-flavor.ts. Both read the same fact and must agree.
   */
  var baseEl = document.querySelector('base');
  var basePath = baseEl ? new URL(baseEl.href, window.location.href).pathname : '/';
  if (basePath.replace(/\/+$/, '').split('/').pop() === 'test') {
    document.documentElement.classList.add('is-test-build');
  }
})();
