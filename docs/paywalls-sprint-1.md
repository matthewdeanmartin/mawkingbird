# Sprint 1: contextual Plus paywalls and authoritative pricing

Created 2026-09-12. Status: implemented and validated locally; results recorded below. Production is not activated.

## Outcome

A free user encounters a clear upgrade offer at the agreed paid-feature entry
points. The offer quotes the price checkout will actually use. A paying user
continues to the feature, and background work never creates repeated dialogs.

This sprint extends the existing Stripe integration. It does not create a new
billing system or launch production checkout.

## Agreed behavior

| Surface | Trigger | Free user | Paid user |
| --- | --- | --- | --- |
| Settings sync | Enter the settings sync tab, currently `/settings/config` | Show the sync paywall once per route entry, with dismissal; retain an inline offer afterward | Show working sync settings |
| Feed subscriptions | Click **Sync feeds** on the RSS reading page; also expose the same action in RSS management | Show the feed-sync paywall | Run the existing cloud subscription sync flow |
| Stored connections | Click **Sync connections** in the relevant connection storage settings | Show the stored-connections paywall | Continue through existing identity, vault unlock, and sync requirements |
| Free Mawkingbird proxy exhausted | First confirmed rate-limit response in a visible browser session | One popup: **Sign up for Plus**, **Disable features that need proxy**, **Not now** | Ordinary rate-limit recovery, never an upgrade offer |

The settings paywall is tied to entering the sync settings tab, not editing a
setting, clicking Sync, or automatic sync. It does not appear throughout the
entire settings area. Returning to the tab is a new visit; rerenders, entitlement
refreshes, and background writes are not new visits.

Feed sync means synchronizing subscriptions across devices, not refreshing
articles. Scope the first button to `/rss` and `/settings/rss`, whose subscriptions
match the existing profile feed model. Label it **Sync feeds across devices** if
needed to distinguish it from Refresh. Do not suggest that Mastodon server feeds,
Bluesky feeds, or fetched article bodies are covered by this operation.

Use **Create free account** for registration and **Get Plus** for paid activation.
Creating an account does not unlock paid features. Preserve existing identifiers,
account plumbing, public origins, OAuth redirects, and persisted storage keys.

## Source review: what exists today

The following are observations of local source, not an audit of deployed Workers
or the live Stripe account.

| Area | Evidence | Conclusion |
| --- | --- | --- |
| Checkout | `../mawkingbird_cors_proxy/src/plus/checkout.ts`, `handleCheckoutRequest` | Checkout already uses a server-configured `STRIPE_PRICE_ID`, binds payment to the verified account, and validates the return URL |
| Entitlements | `../mawkingbird_auth/src/account/billing.ts` | Stripe webhook processing and entitlement persistence already exist |
| Display price | `ui/src/app/plus-benefits.ts`, `PLUS_PRICE_USD_PER_YEAR` | The app independently hard-codes $30/year; it can drift from checkout |
| Sales site | `../mawkingbird_plus/src/config.ts` | Membership is disabled; coordinate its price display with the app |
| Article allowance | `ui/src/app/providers/article/article-quota.ts` | Two successful free expansions per local calendar day, stored in the browser; resets/other browsers can bypass this |
| Article statistics | `../mawkingbird_profile/src/reading-stats.ts` and `/reading-stats` in `handler.ts` | Approximate lifetime totals; explicitly bookkeeping, not a daily allowance or billing meter |
| Proxy statistics | `../mawkingbird_cors_proxy/src/plus/usage.ts` | Approximate supporter request totals; explicitly not quota enforcement |
| Proxy rate limits | `../mawkingbird_cors_proxy/src/rate-limit.ts` | Request throttling exists independently of article counts |
| Profile writes | `../mawkingbird_profile/src/authorize.ts` | Paid writes enforced by the Worker; ordinary profile reads, exports, and deletion remain available |
| Feed payload | `ui/src/app/providers/account/profile-feeds.ts` | Syncs subscription URL, title, and folders; not article bodies or browser-specific proxy/enabled preferences |
| Availability | `ui/src/app/feature-flags.ts` | Plus and paid proxy default to test builds; vault availability is separately constrained |

**Article metering answer:** there is browser allowance enforcement and server
usage accounting, but no enforced server-side daily article allowance was found
in the reviewed proxy, profile, and auth Worker source. Do not turn the approximate
statistics into a quota by checking whether their total exceeds a threshold.

## Tickets, in implementation order

### PW-1 — Expose the checkout price as a shared catalogue

Repositories: `mawkingbird_cors_proxy`, `mawkingbird`, `mawkingbird_plus`.

Start with the existing configured Stripe Price ID. Add a public, sanitized
catalogue response in the checkout Worker which retrieves that Price server-side.
Return the offer identifier, price identifier/version, currency, amount in minor
units, recurring interval/count, and availability. Keep feature descriptions in
the app's capability catalogue; Stripe supplies commercial terms.

Use a shared resolver for display and checkout. Cache validated catalogue data
for a bounded period (proposed: five minutes). The app and sales site consume
this response, replacing independently maintained amount/interval strings.
Stable Stripe lookup keys can replace configured IDs later; they are not needed
to fix the present mismatch. Stripe documents both lookup keys and caching in
[Manage products and prices](https://docs.stripe.com/products-prices/manage-prices).

Acceptance criteria:

- A configured price change updates all purchase CTAs without rewording or
  rebuilding each surface. Cover the header, plans, Plus page, paywalls, and
  sibling sales pages; search for remaining hard-coded purchase prices.
- Currency and billing interval are formatted from the catalogue. No invented
  trial, discount, monthly equivalent, or new subscription option.
- Checkout accepts the expected offer version for comparison but chooses the
  actual price server-side. If the displayed offer has changed, return a
  price-changed result and ask the user to review the new terms before checkout.
- Missing catalogue data displays the agreed US$30/year fallback. Missing Stripe
  read permission permits checkout with the configured annual price; inactive,
  wrong-environment, or unsupported prices still block checkout.
- Only this deployment's allowlisted offer is exposed; Stripe credentials never
  enter the browser. Test and live catalogue caches cannot mix.
- Existing customers' subscription terms are not rewritten when the acquisition
  price changes. Preserve webhook-based entitlement and checkout return handling.

### PW-2 — Shared paywall presenter and feature-access decisions

Repository: `mawkingbird`, maintained Angular client in `ui/`.

Provide a shared presenter with feature-specific headings and body copy, a
catalogue-backed purchase action, sign-in recovery, and dismissal. Keep account
entitlement separate from `PlusFeatures` preferences and deployment availability.

Acceptance criteria:

- Confirmed-free users see the offer; paid users proceed; unresolved entitlement
  shows checking/retry rather than classifying the account as free.
- Resolve stale entitlement once before turning a paid user's `402` into an
  upgrade offer. `401`, identity-related `403`, network errors, and rate limits
  remain distinct outcomes.
- Only one dialog is open at a time. Focus enters the dialog, Escape dismisses,
  and focus returns appropriately. Mobile layout and translated copy work.
- Signed-out users see the paid terms before registration. Keep the existing
  account checkout success/cancellation flow; a success URL alone never grants
  access. No route restoration or replay of the interrupted action is added.
- Unavailable features have availability messaging rather than a purchase CTA.

### PW-3 — Settings sync paywall on tab entry

Repository: `mawkingbird`.
Entry point: `ui/src/app/pages/settings/config/`.

Acceptance criteria:

- Direct links and navigation into `/settings/config` show the sync offer to a
  confirmed-free account once per route activation, after entitlement settles.
- Dismissal leaves ordinary settings, local data, file import/export, and an
  inline Plus offer accessible. No automatic reopen during that visit.
- Paid users see the normal settings sync controls. Their explicit sync
  preferences remain respected.
- Automatic sync, settings changes elsewhere, and failure retries cannot open
  this paywall. Background payment refusal appears as a status message.

Copy direction: **Your settings, on every device** — “Get Plus to keep your
Mawkingbird setup in sync.” Secondary action: **Keep settings on this device**.

### PW-4 — Explicit feed and stored-connection sync entry points

Repository: `mawkingbird`.
Entry points: `pages/rss/rss-page`, `pages/settings/rss/`, and the existing
connection storage/vault settings near `pages/settings/connections/`.

Acceptance criteria:

- Add **Sync feeds** to RSS reading and management, using the same action and
  entitlement gate. A free user's click opens the contextual paywall before a
  cloud write. Retrying after dismissal opens it again.
- A paid user's action syncs subscriptions through the existing profile feed
  model, handles conflicts/errors, and reports success. It must not be a button
  that only opens account settings or refreshes feed content.
- In the settings location for stored connections, add **Sync connections**.
  Free users get its paywall on click. Merely connecting a service locally does
  not trigger a paywall or change where its credentials are stored.
- Paid users still satisfy identity and vault unlock requirements; an upgrade
  cannot substitute for either. Only deployments supporting the vault show the
  actionable offer.
- Existing free read/export/delete behavior stays intact according to each
  service's policy; do not assume the vault has ordinary profile read rules.

### PW-5 — One proxy exhaustion prompt and a reversible disable option

Repository: `mawkingbird`.
Entry points: shared CORS proxy request handling/settings and dependent callers.

Acceptance criteria:

- Identify a free Mawkingbird proxy rate-limit response. An upstream publisher's
  `429` or an unrelated/custom proxy error cannot trigger this upsell.
- Show at most one automatic exhaustion popup per browser tab session. Persist
  its dismissed/shown state across reloads using a newly registered private
  session record, without renaming existing storage keys. A hidden tab does not
  steal focus; defer its one notification until visible and still relevant.
- Concurrent requests, ten-second polling, rerenders, and dismissals cannot
  reopen it. Later failures update an inline notice with an explicit upgrade
  action; paid users receive ordinary retry messaging.
- Respect retry timing and stop avoidable retry storms independently of dialog
  suppression. Closing the dialog does not immediately retry everything.
- Actions: **Sign up for Plus**, **Disable features that need proxy**, **Not now**.
- Disabling immediately stops new proxy-dependent automatic activity and blocks
  explicit proxy-dependent operations with an inline explanation. Show which
  activities are affected before the user selects this action. Direct connections
  and cached/local data remain usable.
- Disablement is a local, reversible preference with a clear **Re-enable** action
  in connection settings. Preserve credentials and feed subscriptions; do not
  implement it with `CorsProxySettings.clear()`, which also clears a stored key.
- Enumerate proxy callers during implementation and test that disabled callers
  do not silently fail over to another proxy or keep polling through a bypass.

## Sprint boundaries

Included: catalogue consistency, shared presenter, settings-tab paywall, feed
and stored-connection buttons, and nonrepeating proxy exhaustion handling.

Deferred: server-side article quota design/enforcement, changes to the existing
two-free-article policy, new advertising/card frequency work, new paid features,
new billing plans, production activation, and deployment. Reuse the existing
badge/offer surfaces for catalogue prices without redesigning them this sprint.

Before a later server article-metering sprint, decide whether the allowance is
per anonymous browser, network address, or account; what constitutes a successful
read; how cache hits and failures are treated; and how concurrent reads reserve
allowance. The present usage counters answer none of those authorization questions.

## Validation and definition of done

- Meaningful targeted Angular specs cover route-entry versus background triggers,
  each explicit button, paid/free/lapsed/checking/unavailable states, recovery
  after checkout, and proxy dialog deduplication across requests and reloads.
- Worker tests cover catalogue validation, caching, environment separation,
  price changes between display and checkout, and server-selected checkout price.
- Browser verification covers keyboard dismissal, narrow viewport, price loading
  failure, cancelled checkout, delayed entitlement, and reversible proxy disabling.
- Run the full Angular gate with Git Bash and supported Node: `cd ui && make test`.
  Preserve test inventory checks; do not skip, focus, delete, or weaken tests.
- Run the required checks of every modified sibling repository after reading its
  contributor instructions. Keep `mastodon_mock/ui` untouched. If integration
  tests are used, use the PyPI wheel, never the sibling source or an editable install.
- All five tickets pass before calling the sprint implemented. Report local test
  results separately from live Stripe/deployment verification. No production
  release is implied by completing this implementation sprint.


## Implementation record

Implemented in `mawkingbird`, `mawkingbird_cors_proxy`, and
`mawkingbird_plus`. No auth/profile Worker changes or article-metering changes.

- PW-1: public validated catalogue, bounded Stripe response reads, five-minute
  cache, fresh checkout revalidation, 409 on offer change, and runtime prices in
  app and sales site. Prices: Read enables live pricing; the interim fallback does not require it.
- PW-2: shared membership-aware dialog, native modal focus/keyboard behavior,
  catalogue retry and sign-in recovery. The optional return-to-task link was
  removed by product decision.
- PW-3: one paywall per settings-sync route activation, with dismissal and an
  inline entry; automatic sync never opens it.
- PW-4: RSS reading/management sync buttons use the existing adoption flow and
  merge decision. Subscription folders now survive that flow. Connection sync
  keeps the existing identity/unlock and conflict requirements.
- PW-5: one automatic proxy prompt per tab session, source-aware rate-limit
  detection including batch results, cooldown, local disabling without deleting
  credentials, and a re-enable control. Native fetch callers are also blocked
  while proxy activity is disabled.
- Tab-only records stay out of all exports. A successful account mint clears a
  previous account-service outage so membership checks can recover.

Validation: Worker type/lint/coverage and production/test deployment dry runs;
sales-site type/build and all static-page checks; Angular targeted tests and
full coverage/inventory gate. Headless Edge checks exercised real rendered
settings entry, a mocked catalogue response, keyboard dismissal, mobile width,
concurrent proxy exhaustion, disabling, re-enabling, and reload suppression.
Screenshots are local QA artifacts in `ui/.test-results/paywall-desktop.png`
and `paywall-mobile.png`.

No live Stripe payment, account creation, deployment, or production activation
was performed. Current live Stripe catalogue contents and restricted-key
permissions were not queried. Deployment order and key requirements are
documented in the proxy README.

Additional baseline checks: the broader static check reports stale bundled
starter-kit membership; those inputs were not changed in this sprint. Whole-tree
formatting also reports existing issues outside the changed files. Changed
source files are formatted separately; these unrelated files are left untouched.


Final local results: `cd ui && make test` passed with **6,444 runtime tests**,
coverage floors satisfied, and no missing inventory entries. The Worker
`make check` passed with **291 tests**, type and lint checks, and both deployment
dry runs. The sales site `make build && make test` passed (29 generated pages,
3 static-site checks). Changed-file formatting, UI lint, storage classification,
and i18n checks passed. The final billing-copy changes also passed their targeted
page tests.

### Interim annual price fallback

The app and sales page show US$30/year immediately and when catalogue loading fails. Valid catalogue prices replace that fallback. The Worker uses the same annual fallback when Stripe returns HTTP 403 because the restricted key lacks Prices:Read; adding that permission is optional for this interim rollout. Checkout still uses only the server-configured STRIPE_PRICE_ID, and Stripe Checkout shows the actual terms before payment. That configured price must remain the existing US$30 annual price while read access is unavailable. Readable changed prices require review before checkout; invalid or inactive prices and other Stripe errors still block checkout.

### Recommended next sprint

1. Route an explicit article expansion after the two free daily reads into the
   shared paywall. Keep cached articles, failed reads, and opening the original
   article free.
2. Finish the endorsement, call-to-action card, and app-name badge entry points,
   with frequency caps and suppression for paid members.
Checkout return/resume handling is out of scope by product decision; keep the
existing Stripe success and cancellation flow simple.

Server-side daily article metering remains a separate follow-up: the browser
currently counts the allowance, while Worker usage counters do not enforce it.


### Plus recommendations implemented

The right rail has a Plus house recommendation and the home timeline uses the mixed 15-post CTA schedule described in
`feed-cta-cards.md`. Both use the existing mawkingbird-plus feature
flag, appear only after the account resolves as free, and honor the existing
ads master switch. Dismissing either suppresses both until the app reloads;
route changes and background refreshes do not clear dismissal. Existing
third-party endorsements remain governed by their own existing ad preferences.
The header badge already uses the same Plus flag. No checkout-resume state or
return-to-task link is retained.
