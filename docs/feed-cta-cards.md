# Home-feed call-to-action cards

Change `FEED_CTA_INTERVAL` in `ui/src/app/feed-ctas.ts` to adjust spacing.
It defaults to **15 displayed posts**. This is one schedule for the whole mixed
pool, replacing both the old 20-post discovery schedule and the standalone Plus
card after five posts. Non-feed layouts do not insert cards.

The source inventory contains **20 feature cards** (including the nine existing
ways to find people) and **10 Plus cards**. Copy uses normal translation keys
declared alongside the inventory; run `cd ui && npm run i18n:extract` after
editing English declarations.

The deck is shuffled once per app session. Each eligible card gets at most one
slot, and keeps that slot during refreshes and navigation. Opened, dismissed,
or newly ineligible cards leave that slot empty rather than moving neighboring
cards. After the eligible deck is exhausted, no more cards are inserted.

## Local feature history

Opening a card retires that particular suggestion. Normal visits to feature
pages also count, including initial page loads and the embedded feed Analytics
view. Query parameters distinguish starter packs from collections and account
search from post search. Simply displaying a CTA is not treated as using its
feature. Visiting the Plus page does not retire all ten Plus pitches at once.

Only known feature IDs are stored, under `mockingbird_feature_use`. No account,
URL, query text, timestamp, or event is sent to a server. The registry excludes
this history from settings sync and all exports. Clearing browser data resets
it; blocked storage still works for the current app session. Visits predating
this implementation cannot be reconstructed.

Dismissal is session-local. The existing right-rail Plus recommendation remains
separate; its shared Plus dismissal also suppresses Plus feed cards.

## Plus inventory and gates

The ten pitches cover article reading, RSS subscriptions, account lists, trusted
accounts, settings, encrypted connections, higher proxy allowance, appearance
preferences, reading preferences, and RSS folder organization. Appearance and
reading preferences are parts of settings sync; folder organization is part of
RSS sync. These are supported benefits, not ten invented subscription tiers.

Every Plus card uses the existing Mawkingbird Plus promotion visibility:
the Plus flag must be enabled, the account must resolve as free, ads must be on,
and Plus recommendations must not have been dismissed. Proxy and connection
vault cards additionally respect their own capability rollout boundaries.
General feature cards honor any corresponding feature flag.


## Presentation and runtime translations

General cards show a visible **Explore Mawkingbird's Features** heading, followed
by a single **Feature title:** description paragraph. Plus cards use a visible
**Mawkingbird Plus** heading. The label is not only an accessibility attribute.

Dictionary requests include the build commit as a query parameter (or build
timestamp when no commit is available), preserving each deployment's own base
path. This prevents a new canary bundle from requesting the same cache entry
as an older English or translated dictionary. Unstamped local builds retain
their ordinary URLs.

Load More itself does not load translations: it inserts cards that use
Transloco's current dictionary. The English source contains every CTA key.
An older cached dictionary is consistent with old discovery cards translating
while newer CTA keys appear raw; a read-only live canary check returned HTTP
403, so the exact dictionary served to the reported browser was not verified.
Regression coverage uses the production HTTP loader, delayed dictionary
responses, all 30 cards inserted after the initial load, and a partial
non-English locale that must load English fallback for new keys.
