/**
 * Mawkingbird's service worker: lets the app open without a connection.
 *
 * Deliberately small and conservative (spec/low-bandwidth-offline.md, Sprint 4):
 *
 *  - Hashed build files (main-XXXXXXXX.js, chunk-…, styles-…) never change, so
 *    they are served from the cache once saved, and saved the first time they
 *    are used. Nothing is fetched ahead.
 *  - Navigations go to the network first. Only when the network fails is the
 *    saved app shell (index.html) used, so an online reader always gets the
 *    current deployment and the GitHub Pages 404 deep-link restore keeps working.
 *  - A short list of unhashed shell files (boot.js, translations, icons, the
 *    manifest) is network-first with the saved copy as a fallback.
 *  - Everything else passes through untouched: API calls, other sites, the
 *    connectivity probe, and the /canary/, /test/, /help/ and /news/ subtrees,
 *    which are other deployments or static sites with their own lifecycles.
 *
 * KILL SWITCH: set KILL_SWITCH to true and deploy. Every browser that checks
 * for an update (on its next navigation; the script itself is never served
 * from the HTTP cache) deletes these caches, unregisters, and reloads its tabs
 * from the network. See ops/engineering/service-worker.md.
 *
 * Plain ES5-ish JavaScript with no build step, so it is exactly what ships.
 * When not running as a service worker (the unit tests), it only exposes its
 * pure routing functions on `self.__mbServiceWorker`.
 */
(function (root) {
  'use strict';

  var KILL_SWITCH = false;

  /** Other deployments under this site. Keep in sync with 404-subpath-redirect.html (check:subpaths). */
  var SUBPATHS = ['canary', 'test'];
  /** Static sites published beside the app; never answered with the app shell. */
  var STATIC_SITES = ['help', 'news'];

  var CACHE_PREFIX = 'mawkingbird-';
  var SHELL_KEY = '__shell__';
  /** Saved build files beyond this many are dropped oldest first. */
  var MAX_IMMUTABLE = 600;
  /** After a build file was missing from the cache, refresh the shell at most this often. */
  var SHELL_REFRESH_MS = 10 * 60 * 1000;

  var HASHED = /[-.][A-Z0-9]{8}\.(?:js|css|woff2?|ttf|otf)$/;
  var SHELL_STATIC =
    /^(?:boot\.js|site\.webmanifest|favicon[^/]*|apple-touch-icon\.png|android-chrome-[^/]+\.png|i18n\/[a-z-]+\.json)$/i;

  /** Cache names are per scope, so /canary/ can never read or clear production's. */
  function cacheNames(scopePath) {
    var tag = scopePath.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';
    return {
      immutable: CACHE_PREFIX + tag + '-build',
      shell: CACHE_PREFIX + tag + '-shell',
    };
  }

  /**
   * What to do with one request: 'pass' (leave it alone), 'navigate',
   * 'immutable' or 'static'. `scopePath` is the registration scope's path,
   * ending in '/'.
   */
  function classify(url, method, mode, origin, scopePath) {
    if (method !== 'GET') return 'pass';
    var parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return 'pass';
    }
    if (parsed.origin !== origin) return 'pass';
    if (parsed.pathname.indexOf(scopePath) !== 0) return 'pass';
    var rest = parsed.pathname.slice(scopePath.length);
    var first = rest.split('/')[0];
    if (SUBPATHS.indexOf(first) !== -1 || STATIC_SITES.indexOf(first) !== -1) return 'pass';
    if (mode === 'navigate') return 'navigate';
    if (rest.indexOf('/') === -1 && HASHED.test(rest)) return 'immutable';
    if (rest.indexOf('media/') === 0 && HASHED.test(rest)) return 'immutable';
    if (SHELL_STATIC.test(rest)) return 'static';
    return 'pass';
  }

  /** Hashed build files an index.html refers to, as paths relative to the scope. */
  function referencedBuildFiles(html) {
    var found = [];
    var re = /(?:src|href)="([^"]+)"/g;
    var match;
    while ((match = re.exec(html))) {
      var ref = match[1];
      if (
        ref.indexOf('//') === -1 &&
        ref.charAt(0) !== '/' &&
        HASHED.test(ref) &&
        found.indexOf(ref) === -1
      ) {
        found.push(ref);
      }
    }
    return found;
  }

  var core = {
    KILL_SWITCH: KILL_SWITCH,
    SUBPATHS: SUBPATHS,
    STATIC_SITES: STATIC_SITES,
    classify: classify,
    cacheNames: cacheNames,
    referencedBuildFiles: referencedBuildFiles,
  };

  var isWorker =
    typeof root.ServiceWorkerGlobalScope !== 'undefined' &&
    root instanceof root.ServiceWorkerGlobalScope;
  if (!isWorker) {
    root.__mbServiceWorker = core;
    return;
  }

  // ------------------------------------------------------------- the worker

  var scopeUrl = root.registration.scope;
  var scopePath = new URL(scopeUrl).pathname;
  var names = cacheNames(scopePath);
  var lastShellRefresh = 0;

  function ourCaches() {
    return root.caches.keys().then(function (keys) {
      return keys.filter(function (key) {
        return key === names.immutable || key === names.shell;
      });
    });
  }

  function trim(cache) {
    return cache.keys().then(function (keys) {
      var excess = keys.length - MAX_IMMUTABLE;
      var deletions = [];
      for (var i = 0; i < excess; i++) deletions.push(cache.delete(keys[i]));
      return Promise.all(deletions);
    });
  }

  function saveBuildFiles(urls) {
    return root.caches.open(names.immutable).then(function (cache) {
      return Promise.all(
        urls.map(function (url) {
          return cache.match(url).then(function (hit) {
            if (hit) return null;
            return fetch(url).then(function (response) {
              if (response.ok) return cache.put(url, response);
              return null;
            });
          });
        }),
      )
        .then(function () {
          return trim(cache);
        })
        .catch(function () {
          // A file that fails now is fetched again the next time it is used.
        });
    });
  }

  /** Fetch the scope's index.html and keep it as the offline shell, with its build files. */
  function refreshShell() {
    lastShellRefresh = Date.now();
    return fetch(scopeUrl, { cache: 'no-store' })
      .then(function (response) {
        if (!response.ok) return null;
        return response
          .clone()
          .text()
          .then(function (html) {
            return root.caches
              .open(names.shell)
              .then(function (cache) {
                return cache.put(SHELL_KEY, response);
              })
              .then(function () {
                var files = referencedBuildFiles(html).map(function (ref) {
                  return new URL(ref, scopeUrl).href;
                });
                return saveBuildFiles(files);
              });
          });
      })
      .catch(function () {
        // Offline at install time: the shell is saved on a later visit.
      });
  }

  function kill() {
    return ourCaches()
      .then(function (keys) {
        return Promise.all(
          keys.map(function (key) {
            return root.caches.delete(key);
          }),
        );
      })
      .then(function () {
        return root.registration.unregister();
      })
      .then(function () {
        return root.clients.matchAll({ type: 'window' });
      })
      .then(function (windows) {
        windows.forEach(function (client) {
          client.navigate(client.url);
        });
      });
  }

  root.addEventListener('install', function (event) {
    root.skipWaiting();
    if (!KILL_SWITCH) event.waitUntil(refreshShell());
  });

  root.addEventListener('activate', function (event) {
    event.waitUntil(KILL_SWITCH ? kill() : root.clients.claim());
  });

  root.addEventListener('message', function (event) {
    var data = event.data || {};
    if (data.type === 'save-loaded' && Array.isArray(data.urls)) {
      // The page loaded these before this worker controlled it; save the
      // hashed ones so the first offline start has the routes already seen.
      var urls = data.urls.filter(function (url) {
        return classify(url, 'GET', 'no-cors', root.location.origin, scopePath) === 'immutable';
      });
      event.waitUntil(saveBuildFiles(urls));
    } else if (data.type === 'stats' && event.ports && event.ports[0]) {
      var port = event.ports[0];
      event.waitUntil(
        root.caches
          .open(names.immutable)
          .then(function (cache) {
            return cache.keys();
          })
          .then(function (keys) {
            return root.caches.open(names.shell).then(function (shell) {
              return shell.match(SHELL_KEY).then(function (hit) {
                port.postMessage({ files: keys.length, shell: !!hit });
              });
            });
          }),
      );
    } else if (data.type === 'remove') {
      event.waitUntil(
        ourCaches().then(function (keys) {
          return Promise.all(
            keys.map(function (key) {
              return root.caches.delete(key);
            }),
          );
        }),
      );
    }
  });

  root.addEventListener('fetch', function (event) {
    if (KILL_SWITCH) return;
    var request = event.request;
    var kind = classify(request.url, request.method, request.mode, root.location.origin, scopePath);
    if (kind === 'pass') return;

    if (kind === 'immutable') {
      event.respondWith(
        root.caches.open(names.immutable).then(function (cache) {
          return cache.match(request).then(function (hit) {
            if (hit) return hit;
            if (Date.now() - lastShellRefresh > SHELL_REFRESH_MS) {
              // A build file we have never seen: probably a new deployment.
              // Keep the offline shell in step with it, off the critical path.
              event.waitUntil(refreshShell());
            }
            return fetch(request).then(function (response) {
              if (response.ok) {
                var copy = response.clone();
                event.waitUntil(
                  cache.put(request, copy).then(function () {
                    return trim(cache);
                  }),
                );
              }
              return response;
            });
          });
        }),
      );
      return;
    }

    if (kind === 'static') {
      event.respondWith(
        fetch(request)
          .then(function (response) {
            if (response.ok) {
              var copy = response.clone();
              var key = request.url.split('?')[0];
              event.waitUntil(
                root.caches.open(names.shell).then(function (cache) {
                  return cache.put(key, copy);
                }),
              );
            }
            return response;
          })
          .catch(function (error) {
            return root.caches.open(names.shell).then(function (cache) {
              return cache.match(request, { ignoreSearch: true }).then(function (hit) {
                if (hit) return hit;
                throw error;
              });
            });
          }),
      );
      return;
    }

    // Navigation: network first; the saved shell only when that fails.
    event.respondWith(
      fetch(request).catch(function (error) {
        return root.caches.open(names.shell).then(function (cache) {
          return cache.match(SHELL_KEY).then(function (hit) {
            if (hit) return hit;
            throw error;
          });
        });
      }),
    );
  });
})(self);
