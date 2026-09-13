# Local business dashboard inventory

Reviewed 2026-09-12 from local source; no customer records, credentials, or live
billing data were read, and no product data was merged.

## Existing Mimb console

The working implementation is in the sibling `mimb_co` repository:

- `web/src/admin/app/dashboard.component.ts`: counts by tenant status,
  monthly signups/cancellations, donations owed, and server operations.
- `web/src/admin/app/tenant-search.component.ts`: customer search.
- `web/src/admin/app/tenant-detail.component.ts`: subscription details,
  support notes, audit log, and management actions.
- `mimb_co/routes/operator.py`: server-authorized operator endpoints.
- `docs/usage/operator-console.md` and `operator-dashboard.md`: runbook.

From that repository, `make serve-api` serves the backend on localhost:8050;
`make serve-admin` serves the console on localhost:8052. Login requires an
existing operator account. Source presence does not establish that either
service is currently running or connected to live data.

MRR and ARR are unfinished: the dashboard API explicitly returns null pending
a live Stripe pull. This is a useful customer/support console, not yet a complete
business reporting system.

## Mawkingbird coverage

No dedicated Plus business/customer console was found in the local Mawkingbird
client, auth, profile, proxy, sales, or Plus specification projects. The client's
`ui/src/app/admin` manages Mastodon moderation; it does not list Plus customers.

The auth Worker's `migrations/0001_identity.sql` defines users, and
`migrations/0003_billing_entitlements.sql` defines subscription status, Stripe
customer/subscription IDs, paid-through/access-until timestamps, cancellation,
and billing event freshness. These are the starting data sources for a Plus
customer view. Existing proxy/profile usage counters are diagnostics, not
revenue or enforced daily article-metering data.

## Smallest useful next step

Extend the existing operator console with a product selector and a read-only
Mawkingbird Plus section. Share the console navigation and display components;
keep each product's identity, billing records, credentials, and authorization
separate. Do not automatically identify customers across products by email.

The first Plus view should show:

1. Customer lookup, free/paid status, cancellation state, access expiration,
   and links to the relevant Stripe customer/subscription.
2. Paid-customer totals and recent signups/cancellations, with the data's
   refresh time and test/live environment clearly identified.
3. Billing webhook/entitlement freshness and service health for support.

Add revenue reporting only when actual Stripe billing data is connected.
The US$30 annual acquisition fallback is not evidence of what every existing
subscriber pays. Reuse the console before considering a repository or product
merge. No dashboard implementation or merge is included in this change.
