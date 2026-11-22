# Low bandwidth S4–S5: offline app, saved reads, Outbox

Build: `main` after low-bandwidth Sprints 4–5 (2026-11-21). Roadmap:
[low-bandwidth-offline.md](../low-bandwidth-offline.md). Runbook:
`ops/engineering/service-worker.md`. Test on **canary** first: each deployment
has its own worker, so canary cannot affect production.

## What you need

- A signed-in Mastodon account; a laptop with DevTools; a phone.

## Offline app (service worker)

- [ ] Open the app online and use it for a minute (Home, a thread,
      notifications). DevTools → Application → Service workers shows `sw.js`
      active for this deployment's path (`/canary/` on canary).
- [ ] `/connection` → **Offline copy** says the app can open without a
      connection and how many files are saved.
- [ ] DevTools → Network → **Offline**, then reload. The app opens (not the
      browser's offline page) and shows the offline banner.
- [ ] Offline, open a screen you never visited (e.g. Settings → something
      obscure). You get **"Not saved for offline use"** with OK, not an endless
      "Updating…" loop.
- [ ] Back online, reload: everything is current. After the next deploy, the
      first online reload shows the new version.
- [ ] `/help/` and `/news/` still load normally online, and are untouched by the app.
- [ ] **Remove offline copy** on `/connection`: the worker disappears from
      DevTools; offline reload now shows the browser's offline page. **Keep an
      offline copy** brings it back.
- [ ] Phone: add to home screen if you use it that way; open it in airplane mode.

## Saved reads

- [ ] Online, read Home, notifications, a thread and a profile.
- [ ] Go offline and reload. Home, notifications, that thread and that profile
      show their saved posts; the banner says **"Showing a copy saved N min ago"**.
- [ ] Offline, scroll Home past the first page: the next page fails politely
      (only first pages are saved).
- [ ] `/connection` shows "Saved for offline reading: X MB (N saved pages)".
- [ ] Remove the account (sign out and forget it). DevTools → Application →
      IndexedDB → `mawkingbird-read-cache`: none of its entries remain.
- [ ] Two accounts: account B offline never shows account A's saved Home.

## Outbox

- [ ] Go offline (airplane mode, or DevTools Offline with the chip showing
      Offline). Write a post and press Post. Compose clears and says it went to
      your Outbox; the banner shows "Waiting to send: 1".
- [ ] `/outbox` lists it as "Waiting for a connection".
- [ ] Come back online: within a few seconds it posts by itself, exactly once,
      and leaves the Outbox.
- [ ] Offline, post a three-part thread; online again, it posts in order as a
      thread.
- [ ] Offline, queue a post, wait **more than 30 minutes**, come back online: it
      does not send by itself. The banner says a post is waiting for you;
      `/outbox` shows **Send now**, **Edit as draft**, **Delete**.
- [ ] **Edit as draft** moves it to Drafts with its text, reply target and CW.
- [ ] Online with a flaky connection where the post's response gets lost: compose
      keeps the text and **Post** again sends it once (no Outbox, no duplicate).
- [ ] Queue a post as account A, switch to account B, go online: nothing is
      posted as B; switch back to A and it sends.

## Findings

_Date, device, browser, deployment (canary/production), what matched and what didn't._
