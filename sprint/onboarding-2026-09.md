# New-user onboarding batch

Work on main. The owner reviews, commits, and pushes after each sprint; the agent does not branch, commit, or push.

## Sprint 1: indicators and text-focus — complete, awaiting owner review

Validation: 132 targeted tests passed before the final localization change; the final complete `cd ui && make test` run passed all 6,291 runtime tests with zero protected identities missing. Changed-file ESLint, i18n checks, storage registry checks, and diff whitespace checks passed. Dependencies installed with `npm ci` under Node 24.18.0. No branch, commit, push, or deployment was performed.

Mastodon badges now subscribe to notification-only and direct-conversation push streams. Bluesky badges observe existing request results and no longer initiate their own fetches; they do not independently refresh in the background. Notification/chat pages retain their existing loading behavior. Text-focus retains the existing preference keys and saved values.

- Restore Mastodon push-driven notification/chat dots; remove badge API polling.
- Keep calming as local delivery scheduling; suppress read, old, outgoing, and replayed events.
- Reuse existing Bluesky request results without badge-only requests.
- Restore a visible, reversible Text-focus toggle alongside Media. Preserve saved preferences.
- Run targeted specs and the complete `cd ui && make test` gate before review.

## Sprint 2: discovery and empty feeds — complete, awaiting owner review

Validation: 241 targeted tests passed; the complete `cd ui && make test` run passed all 6,305 runtime tests with zero protected identities missing. Changed-file ESLint, i18n, storage registry, starter catalogue checks, and diff whitespace checks passed. The locale coverage report was regenerated and remained unchanged. The obsolete account-only empty-state sentence was removed from all app dictionaries; new copy uses the normal English fallback where translations are not yet present.

Home inserts a discovery card after each twentieth displayed post, cycling through all nine discovery methods. Each occurrence has its own dismiss action, retained while loading more posts during that Home visit. Cards do not enter the post data or the Media layout and make no discovery requests. Basic discovery links select distinct starter-pack and collection catalogue views through query parameters; existing routes and the combined catalogue still work.

Empty-source detection includes local follows, hashtags, RSS/paste feeds, connected providers, and actual loaded posts. Only an otherwise empty feed may trigger one one-item source check per relevant network per Home visit, with no retries or pagination. Failed checks remain unknown and do not trigger the empty-source state. Both Mastodon and Bluesky search initially collapse their complete refinement panels on viewports up to 800px, preserving manual expansion and visible active-filter counts.

- Empty means no followed sources and no feed posts, including accounts, tags, feeds, and future hashtag bundles.
- Hide the complete feed toolbar in that empty state and prioritize following something.
- Add feed invitation cards about once per 20 posts, one variant per discovery method, with their own toolbar and a dismiss-this-card action.
- Find Accounts: Basic | Advanced. Basic defaults to Starter packs, Collections, Invite your friends, Offsite directories, in that order. Put all search, including canned searches, in Advanced.
- Search filters initially collapsed on phones and expanded on desktop, with active-filter visibility.

## Sprint 3: navigation, starter packs, and final traffic audit

- Move Waiting to publish (n) from More to Write.
- Move Analytics from More beside Storage Diagnostics, labeled My Profile's Analytics.
- Confirm every authenticated bulk-follow operation; anonymous bulk follows remain immediate.
- Starter packs: Members | Posts | Analytics, Members first, with useful profile cards including bios.
- Remove the anonymous/signed-in implementation explanation from starter-pack UI and its unused translations.
- **At the very end**, audit other accidental request floods: polling, duplicate work, retry loops/backoff, background fetching, and request fan-out, especially traffic to mastodon.social. Do not load-test public servers.
- Run the full test gate at each sprint boundary; stop for owner review and commit/push.
