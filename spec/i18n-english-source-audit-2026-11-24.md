# English-source and raw-key audit — 2026-11-24

## Confirmed dictionary findings

| Inventory | Result |
| --- | --- |
| Shared `ui/public/i18n/*.json` | No non-English keys absent from English; no blank/non-string/key-as-value English entries. |
| Native `.frontend/browser/i18n/*.json` | Two stale entries for one deleted key: `pages.homeProfiles.refresh`, in `ms.json` and `zh-Hans.json`. |
| Native built English vs shared English | Identical key sets: 10,624 keys. |
| Native pinned source (`80cc501fbac128582329444b81712844aa0fd704`) | 18 dictionary files, 8,521 English keys; no translation keys without an English counterpart. |

The two native entries are not live UI references. Shared copies of these stale entries
were removed during the preceding translation work; the existing native build still
contains them. No build output, source pin, native host code or application source was
changed by this audit. Native uses the shared Angular UI; there is no separate host
i18n dictionary. The host Help/Open logs menu has literal English labels.

## Confirmed native raw-key defect: Settings → Network

English is present for every key below. The defect is dictionary-load timing,
not missing English authorship. `SettingsNetwork.modes` and `stateLine` call
synchronous `TranslocoService.translate()` inside computed values without a
dictionary-version dependency. Immediate mocked native proxy status settles before
a delayed English request. The computed strings then remain cached after English
loads, even while adjacent Transloco pipe labels update correctly.

Source: `ui/src/app/settings/network/settings-network.ts:181–217`.
The shared source already contains the intended reactive pattern in
`ui/src/app/i18n/translated.ts` (`TranslatedText.version`).

| Raw key left visible after English loads | Existing English |
| --- | --- |
| `settings.network.mode.direct` | Direct (no proxy) |
| `settings.network.mode.direct.hint` | Connect straight to each server. This is the default. |
| `settings.network.mode.windows` | Use Windows proxy |
| `settings.network.mode.windows.hint` | Use the proxy set in Windows settings. Read when the app starts, or when you press Refresh. |
| `settings.network.mode.http` | Manual HTTP proxy |
| `settings.network.mode.http.hint` | An HTTP proxy that supports CONNECT, such as a company proxy. |
| `settings.network.mode.socks5` | Manual SOCKS5 proxy |
| `settings.network.mode.socks5.hint` | A SOCKS5 proxy, such as Tor. The proxy looks up server names, so they never reach your local resolver. |
| `settings.network.direct` | Connecting directly. |

Reproduction used the existing native `.frontend/browser` assets in Chromium with
mocked typed IPC, an anonymous session, and a 2.5-second delay on `i18n/en.json`.
The IPC returned direct-connection status immediately. After the dictionary response
and a further 1.2 seconds, all nine keys were still visible. Clicking Save against the
mock IPC replaced the status object and all nine labels became English. There were
no page errors. This was a native-bundle browser reproduction, not an installed
WebView2/OS test; no real proxy setting or account was changed.

Evidence (ignored local artifacts):

- `log/i18n-native-delay-repro.json` — before/after rendered text. The JSON field
  `afterRefresh` records the post-Save state (the original harness label was retained).
- Screenshot: `%LOCALAPPDATA%/Temp/mawkingbird/i18n-english-audit/native-network-delayed-english.png`.

## Coverage and limits

- Ran `npm --prefix ui run check:i18n`: passed.
- Compared every key in both current dictionary directories with its own English file.
- Compared all dictionaries in the native pinned Git revision without exporting or building it.
- Scanned shared runtime TS/HTML/JS literals and native compiled JavaScript.
- Parsed 854 Angular templates, including inline/native templates, covering 9,071
  Transloco pipe bindings. Apparent missing prefix keys were inspected: handle step
  numbers, native Algo bin suffixes, forum count suffixes and radio plural helpers
  all expand to existing English keys. Domain names and template property paths
  were excluded from findings.
- Type-aware TS analysis resolved 740 key expressions/alternatives with no missing
  English keys. It left 75 calls unresolved: these include generic message helpers,
  data-driven keys and unrelated post/machine-translation APIs. Arbitrary runtime
  values cannot be exhaustively proved by this static pass.
- The static timing scan identified 94 translation calls in 52 computed fields across
  36 files without a directly recognized dictionary-version read. These are review
  candidates, not 94 confirmed defects. Some are fed by asynchronous data or may
  obtain reactivity through helpers. Indirect helper calls can also escape this scan.
- No application fixes, native rebuild, source deployment, full test/build gate,
  installed-host walkthrough or production-site audit was performed. The audit
  wrote only this report and ignored local evidence.

## Timing-risk candidate index

This is the complete candidate index from the scan above, grouped by computed
field. Only the Network reproduction above is confirmed by the delayed-load test.

| Source | Computed field | Original call lines | Resolution |
| --- | --- | --- | --- |
| `ui/src/app/accounts/account-analytics/account-analytics.ts` | `heatmapSummary` | 971  translatedComputed |
| `ui/src/app/accounts/bulk-actions-dialog/bulk-actions-dialog.ts` | `sourceNoun` | 157  translatedComputed |
| `ui/src/app/accounts/bulk-actions-dialog/bulk-actions-dialog.ts` | `summary` | 208, 211  translatedComputed |
| `ui/src/app/accounts/bulk-actions-dialog/bulk-actions-dialog.ts` | `title` | 177  translatedComputed |
| `ui/src/app/accounts/bulk-progress/bulk-progress.ts` | `unitLabel` | 55  translatedComputed |
| `ui/src/app/accounts/effective-audience-dialog/effective-audience-dialog.ts` | `estimatedTime` | 133, 134  translatedComputed |
| `ui/src/app/accounts/effective-audience-dialog/effective-audience-dialog.ts` | `resultRows` | 183, 191  translatedComputed |
| `ui/src/app/accounts/profile/copy-account-dialog/copy-account-dialog.ts` | `summary` | 334, 337, 342, 347, 355, 366, 372, 377  translatedComputed |
| `ui/src/app/accounts/profile/profile.ts` | `signInFollowAction` | 2685  translatedComputed |
| `ui/src/app/discovery/directory/directory.ts` | `host` | 126  translatedComputed |
| `ui/src/app/discovery/endorsed-list/endorsed-list.ts` | `title` | 60, 61  translatedComputed |
| `ui/src/app/discovery/search-server-discovery/search-server-discovery.ts` | `startText` | 50  translatedComputed |
| `ui/src/app/discovery/search/search.ts` | `emptyExplanation` | 648, 651, 652, 654, 659, 666, 667  translatedComputed |
| `ui/src/app/discovery/search/search.ts` | `resultAnnouncement` | 1798, 1808, 1814  translatedComputed |
| `ui/src/app/discovery/search/search.ts` | `webDroppedLabels` | 1154, 1158, 1162, 1166, 1170  translatedComputed |
| `ui/src/app/discovery/server-discovery/server-discovery.ts` | `startText` | 67  translatedComputed |
| `ui/src/app/discovery/starter-collection/starter-collection.ts` | `signInAction` | 154  translatedComputed |
| `ui/src/app/feeds/feed-analytics/feed-analytics.ts` | `sampleSpan` | 504, 509, 513  translatedComputed |
| `ui/src/app/feeds/home/home.ts` | `feedSource` | 1091  translatedComputed |
| `ui/src/app/feeds/home/home.ts` | `windowLabel` | 373  translatedComputed |
| `ui/src/app/feeds/list-timeline/list-timeline.ts` | `bulkTarget` | 359  translatedComputed |
| `ui/src/app/feeds/list-timeline/list-timeline.ts` | `feedSource` | 144  translatedComputed |
| `ui/src/app/feeds/server-feed/server-feed.ts` | `title` | 102  translatedComputed |
| `ui/src/app/forum/forum-page.ts` | `announcement` | 190, 194  translatedComputed |
| `ui/src/app/observability/observability.ts` | `latencyTicks` | 822, 823  translatedComputed |
| `ui/src/app/posts/status-card/status-card.ts` | `signInAction` | 2549  translatedComputed |
| `ui/src/app/publishing/links/links-page.ts` | `blocked` | 153, 156, 162  translatedComputed |
| `ui/src/app/publishing/write/write-page.ts` | `qualityFindings` | 1817  translatedComputed |
| `ui/src/app/reading/radio/find-singles-page.ts` | `progress` | 154  translatedComputed |
| `ui/src/app/reading/radio/find-singles-page.ts` | `scopes` | 175  translatedComputed |
| `ui/src/app/reading/radio/share-page.ts` | `formats` | 148, 149, 153, 154  translatedComputed |
| `ui/src/app/reading/radio/share-page.ts` | `links` | 130  translatedComputed |
| `ui/src/app/reading/radio/track-result.ts` | `sources` | 152  translatedComputed |
| `ui/src/app/reading/read/article-expansion.ts` | `blocker` | 141  translatedComputed |
| `ui/src/app/reading/read/article-expansion.ts` | `debug` | 232  translatedComputed |
| `ui/src/app/reading/read/article-expansion.ts` | `note` | 214  translatedComputed |
| `ui/src/app/reading/read/reader-core/reader-core.ts` | `originalLink` | 974, 981  translatedComputed |
| `ui/src/app/reading/rss/headline-row/headline-row.ts` | `title` | 75  translatedComputed |
| `ui/src/app/reading/rss/rss-page.ts` | `paneTitle` | 221, 223  translatedComputed |
| `ui/src/app/settings/connections/cors-proxy/connection-cors-proxy.ts` | `currentProxyLabel` | 197  translatedComputed |
| `ui/src/app/settings/connections/doctor/connection-doctor-page.ts` | `groups` | 222  Existing dictionary/language signal dependency; retained |
| `ui/src/app/settings/connections/doctor/connection-doctor-page.ts` | `targets` | 185, 189  Existing dictionary/language signal dependency; retained |
| `ui/src/app/settings/network/settings-network.ts` | `modes` | 194, 195  translatedComputed |
| `ui/src/app/settings/network/settings-network.ts` | `stateLine` | 203, 205, 211  translatedComputed |
| `ui/src/app/settings/posting-defaults/posting-defaults.ts` | `summary` | 94, 96  translatedComputed |
| `ui/src/app/shell/bug-report-dialog/bug-report-dialog.ts` | `externalUrl` | 236  translatedComputed |
| `ui/src/app/shell/bug-report-dialog/bug-report-dialog.ts` | `message` | 166  translatedComputed |
| `ui/src/app/shell/bug-report-dialog/bug-report-dialog.ts` | `pollAnswers` | 157, 158  translatedComputed |
| `ui/src/app/shell/bug-report-dialog/bug-report-dialog.ts` | `reportInput` | 214  translatedComputed |
| `ui/src/app/shell/leave-dialog/leave-dialog.ts` | `who` | 94, 99  translatedComputed |
| `ui/src/app/shell/shell.ts` | `navShort` | 390  Existing dictionary/language signal dependency; retained |
| `ui/src/app/unbird/unbird-posts.ts` | `visibilityOptions` | 125  translatedComputed |

## Fix implementation

Added `translatedComputed` beside `translatedMessage`. It captures the existing
`TranslatedText.version` signal in the injection context and reads it inside the
derived computation. Dictionary-load and language-change events invalidate cached
labels even when native status, cached data and component inputs stay unchanged.
There are no application delays, polling loops or extra network requests.

Migrated 58 computed values across 40 files: 49 of the original 52 candidates,
plus 9 additional word-bearing values found by tracing nested helper calls.
The other three original candidates (Shell navigation and two Connection Doctor
values) already read dictionary/language signals and were retained. The expanded
call-graph pass leaves 24 plain computed values: existing reactive paths or
boolean/post filtering and diagnostic calculations that retain no translated text.

The additional migrated values are:

| Source | Computed field |
| --- | --- |
| `ui/src/app/posts/status-card/status-card.ts` | `activeFilters` |
| `ui/src/app/publishing/conversations/conversations.ts` | `chats` |
| `ui/src/app/settings/connections/settings-connections.ts` | `rows` |
| `ui/src/app/reading/radio/podcast-kits-page.ts` | `languageOptions` |
| `ui/src/app/reading/radio/share-page.ts` | `credit` |
| `ui/src/app/reading/radio/listen-page.ts` | `filterWarning` |
| `ui/src/app/reading/watch/watch.ts` | `filterWarning` |
| `ui/src/app/reading/read/reader-core/reader-core.ts` | `fetchWarning` |
| `ui/src/app/admin/accounts/admin-accounts.ts` | `statusLabel` |

Regression coverage exercises dictionary arrival after an initial key result,
nested translation helpers, retained parameters, ordinary signal changes, and a
live language change with unchanged page data. The native Network regression
checks all eight mode labels/hints plus the status line while reading native status
only once. Tests drive dictionary events explicitly, without sleeping.

Share keeps its selected URLs when only translated labels change; it resets the
default selection when the actual URL list changes. A regression test switches
languages after deselecting a link and verifies that the choice is preserved.

Final verification results are recorded below after the gates and native rebuild.
