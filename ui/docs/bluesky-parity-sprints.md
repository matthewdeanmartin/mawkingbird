# Bluesky correctness: two-sprint follow-up

Scope selected from the [September parity audit](bluesky-parity-audit-2026-09-12.md).
These are the smallest corrections to existing working paths, prioritizing wrong
request destinations, unnecessary requests, and failures presented as empty data.
They do not require new protocol endpoints or a general provider abstraction.

## Sprint 1 — Restore credentials and capabilities together

- Restore each Bluesky identity's Mastodon connector host on cold startup and
  account switching, together with its token. An absent connector clears the old
  host/token; an anonymous connector restores its host without a bearer token.
- Refuse to attach a connector token if the current request destination differs
  from that connector's configured server.
- Decide Mastodon availability from its token, rather than the primary account
  kind. This admits signed-in connectors to indicator streams and prevents
  tokenless Bluesky identities from receiving Mastodon action controls.
- Keep provider-native Bluesky actions independent of Mastodon availability,
  including own-post deletion. Do not expose Mastodon edit history for Bluesky.

Regression coverage asserts actual HTTP destinations and Authorization headers
on startup, Mastodon/Bluesky switches, and switches between two Bluesky DIDs.
It also covers absent/anonymous connectors, mismatched destinations, indicator
stream startup/teardown, and provider-specific status actions.

## Sprint 2 — Conversations respects configured networks

- Load Mastodon conversations/notifications and open its streams only when a
  Mastodon token exists. Guard relationship lookups, context/account lookups,
  and pagination with the same requirement.
- Hide unavailable Mastodon filters and recover persisted filters that would
  otherwise hide the available chats. Anonymous bot chat remains usable.
- Show network-specific inbox failures and provide retry; keep successful chats
  visible if the other network fails. Failures no longer become empty-inbox text.
- Show Bluesky transcript and send failures, retain failed-send drafts, and bound
  requests with a timeout. Cancel stale transcript subscriptions when selecting
  another chat. Late send responses cannot append to the newly selected chat.
- Log inbox, transcript, and send errors through the existing page diagnostics.

Regression coverage exercises Bluesky-only and connected-network loading,
anonymous chat, partial failures, retry, failed sends, and stale transcripts.

## Deferred by request

Privacy and account-setting ownership, moderation management, new DM initiation,
and the remaining feature-parity work stay outside these sprints. The audit's
account-setting ownership finding remains open: connector credentials alone do
not establish which identity a settings screen should manage.

## Validation

Implementation is local and has not been deployed. Validation completed:

- Targeted routing, capability, conversation, status-card, and profile specs passed.
- `cd ui && make test`: 6,347 tests passed, including coverage and test-inventory
  checks. No tests were removed, skipped, focused, or weakened.
- Lint, i18n validation, storage registry, and `npm run build:mockingbird` passed.
- Changed source files are formatted. The repository-wide formatting check still
  reports 21 untouched files; unrelated formatting was left outside this work.

Authenticated Mastodon test fixtures now explicitly supply a token. Their
existing assertions remain intact. There was no live production-account test.
