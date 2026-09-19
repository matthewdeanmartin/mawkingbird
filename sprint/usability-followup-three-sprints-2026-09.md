# Usability follow-up: three-sprint plan

Created 2026-09-19. Sprint 1 implemented and validated locally, ready for user trial; Sprints 2–3 remain planned.

## Scope and sequencing

Cover all 18 feedback items (the standalone dash is a separator). Prioritize lost writing and silent failures, then discovery workflows, then service/setup clarity. Treat these as three outcome-based sprints, not calendar commitments: staffing and sprint duration have not been specified. Allow roughly 20% of each sprint for regression fixes and user testing; re-estimate after reproduction rather than silently dropping scope.

Keep this plan separate from `sprint/usability-2026-09.md`, which records earlier work and has ongoing edits. Before implementation, reconcile overlapping changes in Write, profile/follow state, dialogs, and translations.

## Source findings and open decisions

- Reuse `ui/src/app/account-hover-card/account-hover-card.ts`. It already supplies identity, bio, counts, relationship context, and follow actions. Its current touch/narrow-screen behavior needs an accessible alternative when extending its use.
- `menu-indicator-policy.ts` defaults ordinary delivery to 09:00/17:00, chat delay to five minutes, and quiet hours to 23:00–07:00. `menu-indicators.ts` uses an initial timestamp baseline and authenticated streaming subscriptions; its one-second timer delivers queued signals rather than polling the server. These are findings from local source, not a diagnosis of the reported account or deployed TEST build.
- The English catalogue contains `Credits &amp; Privacy`; the empty-draft translation also exists. Investigate both the translation lookup and why a new account has a draft instead of assuming one root cause.
- `docs/paywalls-sprint-1.md` documents existing sync paywalls and entitlement behavior. The requested Free/Paid naming revises that presentation; it must not accidentally change access rights or activate billing.
- Confirmed: new users receive notification dots through push by default, scoped to Notifications and Chats only. Preserve calming behavior (quiet hours, deduplication, one persistent dot, suppression while reading the relevant page) and existing users' saved schedules. Timeline streaming remains opt-in.
- Confirmed: “quick edit” means the inline reply composer, as distinct from full-screen Write.

## Sprint 1 — Preserve writing and restore trust

Outcome: writing survives navigation, account state stays current, and new users receive understandable feedback.

| ID / original item | Work | Acceptance criteria |
| --- | --- | --- |
| S1-1 / 14 | Fix Write → zen → Back draft loss first. Trace history navigation, leave protection, and save timing in `pages/write`, `writing-zen.ts`, and `drafts.ts`. | Browser Back, app Back, and leaving zen preserve recoverable text, visibility, recipients, content warning, and attachments. Test new and existing drafts, rapid edits before Back, and account switching. Save failures retain the editor or provide recoverable feedback; no duplicate drafts. |
| S1-2 / 13 | Fix fresh-account phantom draft and raw `pages.drafts.preview.emptyDraft` label. | Clean storage/account shows zero drafts before content exists; intentionally retained empty drafts have a translated label. Verify default and another locale, reload, and isolation between accounts. |
| S1-3 / 4 | Investigate Inbox/Chat dots using fresh and established accounts on the same build/server. Record event arrival separately from display eligibility. Check defaults, startup/baseline, token scopes, stream failure/reconnect, active-page suppression, and quiet hours. Then implement the agreed timing and any transport fixes. | Controlled new notification and DM produce the appropriate dot within the agreed delivery window. Test disconnected/reconnected streams, background/resumed tabs, login/account switch, and read/dismiss behavior. Existing preferences survive. Report measured timings and the actual cause; do not equate a faster local timer with working push. |
| S1-4 / 7 | Make the complete profile badge navigate to the profile and refresh its displayed data through shared account/follow state. Start at `shell/left-rail/profile-stack`. | Badge background, name, and avatar open the correct profile by mouse and keyboard; embedded controls retain their own actions. Follow/unfollow, post/delete, and hashtag follow/unfollow update relevant displayed state without reload, including while viewing your own profile. Failed actions do not leave false counts; late responses cannot overwrite another account. |
| S1-5 / 8 | Validate handles at submission in the confirmed quick-edit surface; reuse account-handle/provider resolution where possible. | Invalid/unresolvable recipient handles get actionable inline feedback before publishing, preserving all text. Show resolved identity for review, since a typo can name a real account. Distinguish timeout from nonexistent account; support local/remote formats and avoid treating email, URLs, or quoted text as mentions. Do not silently rewrite recipients. |
| S1-6 / 1 | Give image-view Close a consistently contrasting backing, visible icon, focus indication, and usable target. | Readable over white, black, patterned, and transparent images in light/dark mode; works by keyboard, Escape, and touch without being clipped. |
| S1-7 / 18 | Put each Publish wizard checkbox and its associated label/help text in a separate row. | No ambiguity about which text belongs to each checkbox at desktop/mobile widths, zoom, or with long translations; clicking the label toggles only that checkbox. |

Implementation order: reproduce writing/dot failures first; fix draft lifecycle before empty-draft cleanup; coordinate profile refresh with existing follow-state work. Dot investigation is timeboxed initially, with fix/retest capacity reserved within this sprint.

Sprint review: start a clean account; write a draft, enter zen, press Back and recover it; receive a controlled DM; perform profile-changing actions; inspect image Close and writing settings in light mode. Draft loss blocks sprint acceptance.

### Sprint 1 implementation and evidence

- Write now guards route departure and browser unload. Back first leaves zen with the same editor; another departure offers Save/Discard/Cancel. Failed saves keep that decision pending, and transient attachments cannot be silently dropped by Save and continue. Router cancellation restores the history index. Local draft storage still does not persist attachment bytes: keep the editor open with attachments or explicitly discard them.
- Home's Write action no longer creates an empty saved draft. It opens a new unsaved editor (or resumes an existing empty draft). Existing preview placeholders are translated in Write; previous empty saved rows are preserved, not silently deleted.
- New indicator preferences deliver dots promptly from the existing Notifications/Chat streaming subscriptions. Saved delivery hours and chat delays remain intact. Quiet hours, deduplication, active-page suppression, and single persistent dots remain; timeline streaming stays off by default. Tests assert exactly the two relevant stream subscriptions and no notification/conversation REST polling by the indicator service.
- The profile link covers the card background, identity and avatar; stat links and embedded controls retain their actions. Successful follow/unfollow, post/delete and tag follow/unfollow trigger coalesced refreshes. Hashtag totals include pagination, local tag totals stay reactive, and late refreshes cannot overwrite a newly selected account. Bluesky post/follow record changes also refresh its card. Loading your own Mastodon profile updates the shared account shown in the badge.
- Inline Mastodon and Bluesky replies validate manually entered mentions. Mastodon resolves on the posting server, bypassing alternate search routing, and requires an exact match. Malformed/missing/unavailable handles leave the reply intact; resolved people are shown for review. A changed reply/account cancels the pending send. The already-known Mastodon reply recipient does not need an extra lookup/review.
- Image Close uses a solid dark backing, white outline/icon, focus ring, and 44px target. Publish wizard checkboxes have separate flex rows with associated labels and help text.

Validation on Node 24.18.0 using Git Bash/Make: the first targeted run passed 359 tests; focused mention/profile/provider checks passed 29 tests. The complete `cd ui && make test` gate passed with **7,506 tests**, none failed or skipped, and the protected runtime inventory intact. Lint and i18n checks pass. Final `npm run build:mockingbird` passes, including mock-leakage/lazy-data checks; initial JS/CSS is **878.66 kB** against the unchanged 1 MB error budget. `git diff --check` passes. No server contract changes were made; the separate wheel-backed integration suite was not run in this pass.

Browser checks on the local production-configured preview confirmed: pristine Write has zero drafts; browser Back exits zen without losing text; a second Back offers the leave dialog; Save and continue returns to the preceding page and the saved text appears on reopening Write. Clicking the profile banner opens the profile. Image Close is visible in light mode and Escape closes it. Wizard labels remain separate at desktop and 390px phone widths.

Remaining user trial: validate new-user push on TEST against a real authenticated account/server, including a controlled notification and DM, reconnect, and overnight behavior. Local tests establish the delivery defaults and state behavior; they do not establish the cause of the wife's deployed-account report. Broader dark-mode/non-English device checks also remain. Nothing was deployed by this work.

## Sprint 2 — Make tags useful for discovery

Outcome: picture-heavy tags work as media feeds, tag actions are consistent, and people can be evaluated without repeatedly opening profiles.

| ID / original item | Work | Acceptance criteria |
| --- | --- | --- |
| S2-1 / 12 | Correct search result counts/announcements to reflect result type. | A hashtag-only result says one hashtag, not “Found 0 posts.” Cover tags, people, posts, mixed/empty results, singular/plural, and accessible announcements; do not claim loaded counts are server-wide totals. |
| S2-2 / 5, 6 | Share a compact tag action group: Follow/Unfollow, Feature/Unfeature, Add to bundle. Use it on tag headers and hashtag search rows. | All three actions are adjacent on the tag page and use available right-side space in desktop search. Wrap together on mobile. State stays synchronized across both surfaces; permissions, loading, failures, and bundle membership are clear. No nested link/button conflicts. |
| S2-3 / 2 | Add Posts/Media views to `pages/tag`, reusing existing media rendering and pagination patterns. | Caturday-style feeds offer an actual media grid, with image/video handling, alt text, sensitive-media controls, lightbox, loading/empty/error states, and further pages. Prefer provider-side media filtering when supported; never mistake one page without media for the end of results. Back restores the selected view and position. |
| S2-4 / 3 | Extend the existing account hover card to tag/feed member lists and other comparable member surfaces after a short inventory. | Preview supplies display name, full handle/server, useful bio, available counts, relationship/follow state, and a clear full-profile link. Keyboard focus can reveal/use/dismiss it; touch has an explicit preview action. Avoid clipping and eager per-row profile requests; missing fields remain honest rather than showing misleading zeroes. |
| S2-5 / 15 | Add optional “Follow all tags” on bundle detail and the bundle-list overflow menu, using the same operation. | Preview/count only tags not already followed; explicit invocation starts a bounded batch. Report progress, completion, unsupported access, and partial failures; retry only failures. Respect rate limits and keep per-tag state/profile badge current. Opening or importing a bundle never follows tags automatically. |

Dependencies: S2-2 supplies reusable tag state/actions for S2-5; S1-4 supplies profile refresh; S1-6 protects media-view usability. Reuse existing batch controls and confirmation conventions without rewriting unrelated flows.

Sprint review: search for a tag, follow/feature/bundle it from results, open its media view, preview members, and follow remaining bundle tags. Repeat on narrow screens and with a partial batch failure.

## Sprint 3 — Explain Plus and remove setup friction

Outcome: RSS failures lead directly to a useful choice; Free/Paid/self-hosted options are understandable; sync promotion appears where it helps manage feeds.

| ID / original item | Work | Acceptance criteria |
| --- | --- | --- |
| S3-1 / 10 | Redesign CORS Proxy choice around “Mawkingbird Plus (Free)”, “Mawkingbird Plus (Paid)”, and “Self-hosted proxy”. Confirm current capability/entitlement catalogue and preserve supported third-party options under an additional section. | Explain what each option enables, applicable limits, account/setup requirements, and current selection. Use real capability/pricing data; do not imply signup grants paid sync. Selecting an option performs configuration or opens the appropriate setup/upgrade flow. Existing settings remain valid. |
| S3-2 / 9 | Make RSS paste/import failures on TEST actionable. Audit similar dead-end “go to Settings → …” messages and replace them with actual navigation controls. | Missing/incomplete proxy offers direct Configure proxy and relevant Free/Paid choices, preserving the entered feed. Distinguish configuration failure, remote-feed failure, and throttling. Retry succeeds after setup. Gate unavailable offers honestly by build; links resolve in TEST and production. |
| S3-3 / 11 | Move cross-device sync promotion to feed management and an explicit toolbar/menu action. | Recommended design: “Sync subscriptions across devices” in RSS management; a compact reading-page menu action opens the same flow. A contextual explanation after adding/importing feeds may be dismissible and shown once. Remove the intrusive current placement. Free users see benefits/upgrade only on relevant intent; paid users see sync status/actions. Clarify that subscriptions, not article bodies, are synced. Retain accessible entry points after dismissal. |
| S3-4 / 16 | Rename the Docs Plans navigation/title to “Mawkingbird Plus Paid Plans”. | Navigation, page heading/title, and relevant cross-links use the clear name; existing route URLs stay stable. |
| S3-5 / 17 | Audit double-escaped text in app and docs, beginning with Credits & Privacy. Fix the source/template boundary responsible for each occurrence. | Titles, navigation, prose, and relevant locale strings display intended characters once, including ampersands/apostrophes/quotes. Verify app-rendered and built docs surfaces. Do not globally decode untrusted HTML or weaken escaping/sanitization; intentional literal entity examples remain literal. |

Implementation order: agree service-choice copy and mapping first, then reuse it in RSS recovery; relocate sync entry points while preserving existing paywall/entitlement behavior. Audit escaping across the app, not only the reported Credits title.

Sprint review: on TEST with a fresh account and no proxy, paste a blocked RSS feed, follow a direct setup link, return and retry; compare Free/Paid/self-hosted states. Find subscription sync without an in-feed promotion. Inspect Docs plans/credits and long translated labels.

## Validation and completion for every sprint

- Implement only in maintained `ui/` and appropriate `docs/`; never synchronize to the frozen sibling client. Preserve public origins, OAuth redirects, routes, and persisted storage key names. Read `MIGRATION.md` before any publishing changes.
- Use Git Bash/Make and Node 22 or a supported newer version; install with `npm ci` and the committed lockfile as needed. Run targeted behavior specs during development, then `cd ui && make test`; preserve all test inventory checks and never skip/weaken tests.
- For UI runtime changes run `cd ui && npm run build:mockingbird`, inspect the size report, and retain the 1 MB initial error budget. Keep optional data lazy. Use the real-client integration suite for changed server workflows when applicable, with a PyPI-installed mastodon-mock wheel, never the sibling checkout/editable install.
- Each sprint must pass focused manual checks on fresh/existing accounts, light/dark mode, keyboard/touch, narrow screens, and relevant non-English text. Exercise real streaming separately from deterministic unit tests; record which deployed build/account/server was checked without logging tokens or private messages.
- Record test/build results, acceptance evidence, unresolved limitations, and a short user trial script at each sprint boundary. All 18 items must be accepted or explicitly carried forward with a reason; source inspection alone does not close a reported bug.

## Risks and planning assumptions

- Sprint 1 has the highest uncertainty: navigation loss and streaming may have separate causes; prioritize both over cosmetic polish if capacity is constrained, with any move explicitly reflected in the plan.
- Provider support may limit tag media queries, relationship fields, or bulk tag following. Confirm capabilities before implementation and provide honest fallback/error states.
- Plus frontend clarity is in scope; new tiers, quota enforcement, billing activation, and sibling-service redesign are not implied. If existing services cannot support the requested presentation, document the concrete dependency before promising behavior.
- Proposed sprint lengths and staffing remain open; product clarifications above are resolved.
