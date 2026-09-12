# Onboarding: final client request audit

Reviewed the maintained Angular client locally, using mocked HTTP and WebSocket
traffic. No public Mastodon server was used for testing or load generation.

## Fixed

- **Badge polling:** Sprint 1 replaced notification/conversation badge requests
  with Mastodon notification/direct push subscriptions. Bluesky badges observe
  requests already made by the app. Their remaining timer updates local calming
  state; it makes no network requests.
- **Chat polling:** Removed the conversation page's remaining ten-minute Bluesky
  interval. The page now offers Refresh Bluesky chats, disables it while loading,
  prevents overlapping refreshes, and cancels its refresh subscription on exit.
  Mastodon conversations retain their push subscriptions.
- **No-progress paging:** Home's minimum-size fill and Articles' automatic fill
  stopped only at a count/exhaustion limit. Repeated pages or a timed-out provider
  left eligible for the next round could therefore keep requesting. Both now
  stop when a round adds no new posts; explicit Load more remains available.
- **Analytics sampling:** A source repeating a full page could consume all twenty
  allowed requests. Sampling now stops immediately on a page without new IDs,
  deduplicates within pages too, and unsubscribes the active request when its
  caller cancels. The existing twenty-page ceiling remains.
- **Push reconnects:** A connection that opened then immediately closed reset
  backoff to one second. Reset now requires a connection lasting one minute.
  Repeated failures back off to five minutes. Failed instance discovery is also
  shared for five minutes, preventing a fresh `/api/v2/instance` request on every
  stream reconnect during an outage.
- **Cancelled imports:** Account and tag imports now recheck cancellation after
  a rate-limit wait, before issuing the next retry.
- **Starter members and analytics:** Members render cached profiles and bios;
  follow-state resolution occurs on interaction. Opening Posts or Analytics
  samples at most five accounts sequentially, with three posts per account.
  Further sampling requires Load more. Tab changes reuse the sample. Foreign
  account IDs no longer trigger relationship queries on the signed-in server.

## Other paths inspected

- Notification pages load on entry/user action and accept push updates. No REST
  timer was found there. Home live refresh remains an opt-in push subscription.
- Anonymous Home requests have four-way concurrency, per-source exhaustion,
  deduplication, and timeouts. A large followed-source set still costs multiple
  requests when the user opens or reloads Home; this is explicit feed retrieval,
  not idle polling. The new no-progress guard also stops automatic retry rounds.
- The feed aggregator already has source time budgets, page size limits, and a
  loading window. Its timeout path was one reason Home needed the new guard.
- Bulk operations already use bounded paging, sequential writes, and retry
  limits. Direct authenticated bulk-follow entry points now confirm before the
  batch begins; list/bulk-action flows retain their existing confirmation dialog.
- The HTTP rate-limit interceptor coordinates per-origin server cooldowns and
  retries a safe read only once. Provider-specific Twitter and shortener retries
  have their own bounded attempts/delays. External fetches use their provider
  paths rather than the authenticated-server interceptor.
- Other recurring timers found in Home, indicators, compose, bulk progress,
  list controls, house ads, translation usage, and Twitter usage update local
  clocks or counters; they do not initiate API requests.

This is a source review plus local regression coverage, not a production traffic
capture. Multiple open tabs still have independent push connections; the audit
does not introduce cross-tab connection sharing.
