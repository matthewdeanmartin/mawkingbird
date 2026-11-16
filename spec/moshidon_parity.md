# Functional parity with Moshidon

Audit date: 2026-11-16.

This report lists functional capabilities in Moshidon that mawkingbird lacks or only partly has, and the Moshidon features mawkingbird should not copy. It follows the [Sengi/Pachli](sengi_pachli_parity.md) and [Whalebird](whalebird_parity.md) reports. Items covered there, or in the [Phanpy](phanpy_parity.md) and [Mastodon web](mastodon_parity.md) reports, are not repeated.

## Scope and evidence

- Moshidon: `REFERENCE/moshidon`. Moshidon is a native Android (Java) fork of Megalodon, which is itself a fork of the official Mastodon Android app.
  - The checked-out branch is `rewrite` (`d90b8a88243608629e7f91b460c77d1089514bb6`, 2026-07-11). Its README warns that it is incomplete. Most of its preferences in `GlobalUserPreferences.java` are declared but not used anywhere.
  - **The audit therefore uses `origin/master`** (`b6a4211af93e3ae0b5b4baca6acce30cec601f5c`, 2025-06-14, the v2.13 line). That is the shipped app the README describes. Its source is not in the working tree, so the sources below are written as `origin/master:<path>` and read with `git show`, not as links.
- Mawkingbird web: `mawkingbird/ui` at `ac2116a651f1bdd878488a316fd22ff19d4cd242`, plus the working tree. Mawkingbird Native: `mawkingbird_native` at `3fe7c30d50637093783da1e9d1ecb8e5c016ecbc`.
- This is a source audit; neither app was run against a live account. “Missing” and “partial” mean the same as in the earlier reports.

## Overall finding

Moshidon has few big features, but many careful settings. Its distinctive ideas are about **how you behave in public**: nudges before replying to old posts or to strangers, how CWs carry into replies, quiet-public replies, mentioning the booster, and hiding posts whose media lacks alt text. These fit mawkingbird's existing writing-quality stance (the no-mention hint, alt-text requirements and the language-mismatch check).

Its two cross-account and multi-server ideas reinforce items already in the backlog:
- Long-press boost or favourite **as another account** is [Sengi/Pachli item 1](sengi_pachli_parity.md#1-act-on-a-post-as-another-signed-in-account-declined-2026-11-16), which the owner **declined** on 2026-11-16 because it risks linking separate identities. Users switch accounts instead.
- “Load info from remote instances” extends [Sengi/Pachli item 2](sengi_pachli_parity.md#2-fill-in-replies-the-home-server-hasnt-seen-from-the-origin-server-done-2026-11-16) from replies to follower, favourite and boost lists (M8).

| Band | Items |
| --- | --- |
| A: replying with care (composer nudges) | M3, M4, M5, M6 |
| B: alt-text-first reading | M1 |
| C: reading comfort | M2, M7, M9 |
| D: origin-server enrichment | M8 (pair with Sengi/Pachli 2) |
| E: owner decision | M10 |

---

## Reading

### M1. Alt-text indicators and “hide posts with undescribed media” — missing

**Moshidon:** On timeline images it shows an **ALT** badge (tap to read the description) and an optional indicator for **missing** alt text (`showAltIndicator`, `showNoAltIndicator`). A setting hides every post whose media lacks a description from all timelines (`AltTextFilter`), while keeping them visible in threads and notifications so conversations stay whole.

**Mawkingbird:** The profile media grid marks alt text (`profile-media-item.ts`), and feed analytics counts undescribed media. No ALT badge or missing-alt indicator on images in the post card was found, and no feed filter for undescribed media.

**Completion criterion:**
- On post-card media, add an ALT badge that opens the description and an optional “no description” marker. Both need screen-reader text, and the description is already the image's accessible name.
- Add a Home/list/tag filter “Hide posts with undescribed media”, applied locally across Mastodon, Bluesky and Misskey. It counts toward the filter summary like the existing chips and never hides posts inside a thread page or notifications.
- This pairs with [Sengi/Pachli item 4](sengi_pachli_parity.md#4-warn-before-boosting-a-post-with-undescribed-media-missing) (warn before boosting) as one “alt-text-first” settings group.

Sources: `origin/master:mastodon/src/main/java/org/joinmastodon/android/model/AltTextFilter.java`, `…/ui/utils/MediaAttachmentViewController.java`, `…/fragments/settings/SettingsDisplayFragment.java`; [mawkingbird status card](../ui/src/app/posts/status-card/status-card.ts), [profile media item](../ui/src/app/accounts/profile/media/profile-media-item.ts).

### M2. Auto-reveal repeated content warnings in a thread — already supported

**Already supported, hardened 2026-11-16** ([TODO item 9](parity_11_16.md)): opening any CW on the thread page opens every CW in the thread, the state survives moving to another post of the same thread, Radio's listen page shares it, and regression tests cover it. The identical-text rule below stays declined in favour of this broader behavior.

**Correction 2026-11-16:** mawkingbird already does a broader version. On the thread page, opening any CW opens every CW in the thread (`threadCwOpen` in `reading/thread/thread.ts`). The original search missed it. The remaining work (tests, keeping the state while moving within the thread) is [today's TODO, item 9](parity_11_16.md).

**Moshidon:** “Auto-reveal equal CWs in replies”: never, replies by the same author, or replies by anyone (`autoRevealEqualSpoilers`). Once you open a CW in a thread, replies carrying the *identical* CW text open too, so a 20-post thread under “politics” doesn't need 20 taps.

**Mawkingbird:** Has an “expand all content warnings” preference and per-post CW state. No reveal tied to the CW text inside a thread was found.

**Completion criterion:** On the thread and reader pages, opening a CW also opens descendants whose trimmed, case-folded CW text is identical. By default this applies to the same author only, with an option for everyone. Different CW text stays closed. Media behind a sensitive flag follows the existing sensitive-media rule, not this one. It works the same for Misskey CWs.

Sources: `origin/master:mastodon/src/main/java/org/joinmastodon/android/fragments/ThreadFragment.java`; [mawkingbird thread loader](../ui/src/app/reading/read/thread-loader.ts), [status card `cwCollapsed`](../ui/src/app/posts/status-card/status-card.ts).

### M7. Home reply filter by audience: all, replies to my follows, replies to me — partial

**Moshidon:** Home's reply visibility has three settings: all replies, replies to people I follow, and replies to me.

**Mawkingbird:** The Home Replies chip is on or off. Mastodon's *server* already drops most replies to strangers from Home, but boosts, lists and other providers (Bluesky, Misskey) still bring in conversations between people you don't know.

**Completion criterion:** The Replies chip gets a three-way choice: all, “to people I follow”, and “to me”. It's evaluated locally from `in_reply_to_account_id` (and the Bluesky and Misskey equivalents) against the account's known follows. When the follow list isn't fully loaded, say so rather than guessing.

Sources: Megalodon string `sk_settings_reply_visibility_*` in `origin/master:mastodon/src/main/res/values/strings_sk.xml`; [mawkingbird Home](../ui/src/app/feeds/home/home.ts).

### M9. Collapse very long posts — missing

**Moshidon:** “Collapse very long posts” (`collapseLongPosts`) truncates long posts in timelines behind Show more.

**Mawkingbird:** “Show more” exists only for content warnings. No length-based collapse was found. Long posts from servers with high character limits (Misskey, Akkoma and Glitch servers, and Bluesky threads stitched together) can take up a whole screen.

**Completion criterion:** An off-by-default setting that collapses timeline posts over about 500 characters or 12 rendered lines into a clamp with an accessible “Show full post” button. It never applies on the thread page or in reader mode. A CW still takes precedence: the collapse applies only after the CW is opened.

Sources: `origin/master:mastodon/src/main/java/org/joinmastodon/android/ui/displayitems/TextStatusDisplayItem.java`; [mawkingbird status card](../ui/src/app/posts/status-card/status-card.ts).

## Replying with care

### M3. Replies inherit the CW, with an optional “re:” prefix — partial

**Moshidon:** A reply copies the parent's CW. The setting “Prefix CW with ‘re:’” (never, only in reply to others, always) adds `re: ` once, so a long thread doesn't end up with `re: re: re:`.

**Mawkingbird:** The Misskey composer copies the parent CW (`misskey-compose.ts`). No equivalent was found for the Mastodon composer's reply seeding. Verify before building: the carry-over may live in a code path this search didn't reach.

**Completion criterion:** Replying to a Mastodon (and Bluesky-label-equivalent, where it makes sense) post with a CW pre-fills the same CW, and the author can edit or clear it. The optional `re:` prefix is added only when the text doesn't already start with `re:`. The Misskey and Mastodon composers behave the same way.

Sources: `origin/master:mastodon/src/main/java/org/joinmastodon/android/fragments/ComposeFragment.java` (`prefixReplies`); [mawkingbird composer](../ui/src/app/publishing/compose/compose.ts), [Misskey composer](../ui/src/app/connections/misskey/misskey-compose.ts).

### M4. Nudge before replying to an old post or to a stranger — missing

**Moshidon** (inherited from the official Mastodon app): before you reply, a sheet appears when:
- the post is old (“This post is N months old”, `OldPostPreReplySheet`), or
- the author doesn't follow you and you don't follow them (`NonMutualPreReplySheet`), with a reminder that this is a stranger's conversation.

Each sheet has a “don't show again” opt-out.

**Mawkingbird:** Has the composer's no-mention hint and other writing checks, but no pre-reply nudge for age or relationship.

**Completion criterion:** When a reply opens on a post older than about 3 months, or on a non-mutual author's post, the composer shows one dismissible, non-blocking notice above the text field (not a modal). Each kind has its own “don't show again”, and a Settings → Writing switch turns both back on. The relationship comes from the already-loaded relationship. When it isn't loaded, show nothing; never fetch only for this. Mastodon only, plus Bluesky where the relationship is known.

Sources: `origin/master:mastodon/src/main/java/org/joinmastodon/android/ui/sheets/OldPostPreReplySheet.java`, `…/NonMutualPreReplySheet.java`; [mawkingbird composer](../ui/src/app/publishing/compose/compose.ts).

### M5. Mention the booster when replying to a boost — missing

**Moshidon:** “Automatically mention account who reblogged the post in replies” (`mentionRebloggerAutomatically`), so the person who brought the post to you sees the conversation they started.

**Mawkingbird:** Not found.

**Completion criterion:** An off-by-default setting. Replying from a boosted copy adds `@booster` after the author's mention, unless the booster is you or the author. It's shown in the composer as a removable mention, never added silently at send time.

Sources: `origin/master:mastodon/src/main/java/org/joinmastodon/android/fragments/ComposeFragment.java`.

### M6. Replies default to quiet public (unlisted) — missing

**Moshidon:** “Reply as ‘Unlisted’ by default” keeps replies out of public timelines and discovery while staying public to read (`defaultToUnlistedReplies`).

**Mawkingbird:** Replies start from the account's posting default, adjusted by the parent's visibility. No reply-specific default was found.

**Completion criterion:** Settings → Writing: “Replies default to Quiet public”. It applies only when the parent visibility allows it, and it never *widens* visibility (a followers-only parent stays followers-only). It's per account, and the composer shows the chosen visibility as usual.

Sources: `origin/master:mastodon/src/main/java/org/joinmastodon/android/fragments/ComposeFragment.java`; [mawkingbird visibility state](../ui/src/app/publishing/compose/visibility-state.ts).

## Origin-server enrichment

### M8. Follower, favourite and boost lists from the origin server — done 2026-11-16

**Implemented:** behind Settings → Privacy → “Fetch from the original server” (off by default). See [TODO item 8](parity_11_16.md).

**Approved by the owner 2026-11-16**, together with Sengi/Pachli item 2, **off by default** behind a Settings → Privacy switch. See [today's TODO, item 8](parity_11_16.md).

**Moshidon:** “Load info from remote instances” (`allowRemoteLoading`) reads a remote account's followers and following, and a remote post's favourites and boosts, from the **origin** server's public API. The home server only knows the part of those lists that federated to it, so its counts and lists are incomplete.

**Mawkingbird:** Lists come from the home server. Showing the count from one server next to a partial list from another is a known confusion. No origin read was found.

**Completion criterion:** On remote profiles and remote posts, follower, following, favourite and boost lists try the origin's public endpoint first and fall back to the home server. They're labelled “from {server}”, and the user's token is never sent to the origin. Accounts from the origin are resolved through the home server only when acted on. Build this together with [Sengi/Pachli item 2](sengi_pachli_parity.md#2-fill-in-replies-the-home-server-hasnt-seen-from-the-origin-server-done-2026-11-16), sharing one off switch and one origin-read helper.

Sources: `origin/master:mastodon/src/main/java/org/joinmastodon/android/fragments/account_list/PaginatedAccountListFragment.java`; [mawkingbird thread loader](../ui/src/app/reading/read/thread-loader.ts), [anonymous public API](../ui/src/app/accounts/anonymous/anonymous-public-api.ts).

## Owner decision

### M10. Crisis-helpline card on distress searches — decision needed

**Moshidon:** When a search matches a localized list of distress terms (“suicide”, …), it shows “In case you're in distress…” with a link to find a helpline before showing results (`showSuicideHelp`, `SearchQueryFragment.wrapSuicideDialog`).

**Mawkingbird:** Not found.

**Decision:** This is a small, humane feature, but it carries weight: the term lists must be translated with care, the helpline link must be trustworthy for every locale (for example a neutral directory such as findahelpline.com rather than one country's number), and the card should be dismissible and never block the search. If approved, it belongs in the UI i18n pipeline with its own review, not as a quick add.

Sources: `origin/master:mastodon/src/main/java/org/joinmastodon/android/fragments/discover/SearchQueryFragment.java`, strings `sk_search_suicide_*`.

---

## Already covered elsewhere

| Moshidon feature | Where it stands |
| --- | --- |
| Long-press boost or favourite as another account | **Declined** ([Sengi/Pachli item 1](sengi_pachli_parity.md#1-act-on-a-post-as-another-signed-in-account-declined-2026-11-16)): identity-linking risk; switch accounts instead. |
| Confirm before boosting | [Sengi/Pachli item 4](sengi_pachli_parity.md#4-warn-before-boosting-a-post-with-undescribed-media-missing) is the targeted version |
| Alt-text reminder when posting | Already in mawkingbird (stronger: required alt-text options) |
| Pronouns in timelines, threads and lists | [Sengi/Pachli item 7](sengi_pachli_parity.md#7-show-pronouns-and-server-role-badges-missing) |
| Underlined links, reduce motion, freeze GIF avatars and emoji | [Sengi/Pachli item 8](sengi_pachli_parity.md#8-reading-accessibility-display-options-partial) |
| Hide interaction counts | [Sengi/Pachli item 5](sengi_pachli_parity.md#5-wellbeing-hide-engagement-counts-missing) |
| Strip tracking parameters from links | Already in mawkingbird (`lib/link-cleaning`, `post-link-cleaning.ts`) |
| Pin another server's local timeline | Already in mawkingbird (other servers' public feeds) |
| Export and import settings and timelines | Already in mawkingbird (portable configuration) |
| In-app updater from GitHub releases, opt-in pre-releases | [Today's TODO, item 3](parity_11_16.md). Moshidon's opt-in pre-release channel is worth copying when native gets canary builds. |
| Share into the app with an account chooser | [Sengi/Pachli N2](sengi_pachli_parity.md#n2-receive-shares-from-other-apps-including-files-extends-phanpy-11) |
| Personal note on an account | Done ([Phanpy item 7](phanpy_parity.md)) |
| Audio overlay (keep other media playing) | Android audio focus; deferred with Radio ([Sengi/Pachli N4](sengi_pachli_parity.md)) |

## Deliberately not taking

| Feature | Why not |
| --- | --- |
| UnifiedPush and push, notification audience filters, “only one notification”, delete notifications, uniform notification icon | Notifications rule. |
| Emoji reactions, local-only posting, Glitch mode, Markdown/HTML content types | Fork-specific server features (Akkoma, Glitch, Hometown). Mawkingbird already handles Misskey's equivalents. Revisit with fork support. |
| Hide interaction buttons (“spectator mode”) | Mawkingbird already offers read-only account sign-in. Hiding buttons on a full account adds a confusing second mode. |
| Pitch-black theme, colour palettes, scrolling (marquee) titles, heart instead of star, custom publish-button text, moving the publish button, haptics, double-tap tab gestures, swapping the bookmark and boost buttons | Cosmetic or phone-gesture preferences, not functions. |
| Clear home timeline cache, copy crash log | Native diagnostics belong in the planned Data activity page ([Sengi/Pachli N12](sengi_pachli_parity.md#n12-background-work-and-database-diagnostics-needed-by-the-archive)). Web already has a bug-report path. |
| “Forward report” switch default | Mawkingbird deliberately never forwards by default ([Phanpy item 24](phanpy_parity.md)). |

## Boundaries of this backlog

Visual and Material You theming differences are excluded. The `rewrite` branch's declared-but-unused preferences are not counted as features. Only behavior wired in `origin/master` is credited. Before closing M3, confirm whether mawkingbird's Mastodon reply seeding already copies the CW. Before closing M8, test against a remote server that refuses anonymous API reads.
