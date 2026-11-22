# Service worker (offline app shell)

`ui/public/sw.js` lets the web app open without a connection. It is plain
JavaScript with no build step: what is in the repository is what ships. The
page side is `ui/src/app/platform/offline/offline-app.ts`. Background and
decisions: `spec/low-bandwidth-offline.md`, Sprint 4.

## What it does

| Request                                                         | Handling                                                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Hashed build files (`main-…`, `chunk-…`, `styles-…`, `media/…`) | Cache first; saved the first time they are used (max 600, oldest dropped). Never fetched ahead.  |
| Navigations inside the app                                      | Network first. Only on a network failure: the saved `index.html`.                                |
| `boot.js`, `i18n/*.json`, icons, `site.webmanifest`             | Network first, saved copy as fallback.                                                           |
| Everything else                                                 | Untouched: APIs, other sites, `probe.txt`, data files, `/canary/`, `/test/`, `/help/`, `/news/`. |

- It registers 5 s after start, with the base href as its scope, so each
  deployment (`/`, `/canary/`, `/test/`) has its own worker and its own caches
  (`mawkingbird-<scope>-build`, `mawkingbird-<scope>-shell`).
- It is not registered in development (`ng serve`) or in Native.
- `SUBPATHS` in `sw.js` must match the 404 shim; `npm run check:subpaths`
  enforces it. A new subpath deployment needs both lists updated.
- Readers can remove the offline copy on `/connection` ("Remove offline copy").
  That unregisters the worker, deletes its caches and stores
  `mockingbird_offline_app=off`.

## Kill switch

Use this if a worker release misbehaves (stale pages, broken navigation):

1. In `ui/public/sw.js`, set `var KILL_SWITCH = true;`.
2. Release through the normal Pages workflow.
3. On their next navigation, browsers fetch the new `sw.js` (it is registered
   with `updateViaCache: 'none'`, so the HTTP cache never delays it). The new
   worker deletes its caches, unregisters itself and reloads open tabs from the
   network.
4. Leave the kill switch on for at least a week, then set it back to `false`
   (the unit test `service-worker.spec.ts` fails while it is on, as a reminder)
   in the release that fixes the problem.

Never delete `sw.js` from the site instead: a 404 for the script leaves
existing workers installed and serving their caches.

## Testing

- Unit: `npm run test:subset -- src/app/platform/offline` tests the routing
  rules against the real `sw.js`.
- Manual: `spec/test_plans/low-bandwidth-s4-s5-offline-app-and-outbox-2026-11.md`.
  DevTools → Application → Service workers shows the registration; "Offline"
  in the Network panel simulates no connection.
