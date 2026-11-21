# Making Mawkingbird web easier to change

## Implementation on November 21

Thread text now lives in its own [library](../ui/src/lib/thread-text/README.md). Write keeps a URL whole when it exceeds the thread budget and marks that segment over limit. Compose and Write share a [poll editor](../ui/src/app/publishing/poll-editor.ts) for option limits, validity, expiry choices, and draft snapshots. The existing Fullscreen edit action in the quote dialog already uses the handoff into Write. Its sending and receiving specs now exercise partly filled polls with a non-default expiry. Home’s minicomposer now uses the same draft contract.

The first [reader typography change](../ui/src/app/reading/read/reader-typography.ts) covers font weight and line height. Their saved keys and CSS variables are exercised through ClientPrefs, including a reload of persisted settings.

## Where people compose in Mawkingbird web

Home's Quick post now offers Fullscreen edit. The shared Compose component appears **21 times in 17 production templates**. This counts component placements in maintained Angular source, including inline templates. A status card can appear dozens of times on one screen.

| Templates hosting Compose | Placements |
| --- | ---: |
| Home, Drafts, Conversations, Pastes | 4 |
| Cross-post workbench (Mastodon, Bluesky, both) | 3 |
| Profile and profile photo view | 3 |
| Status card, shared-post dialog, quote dialog, Bluesky reply wrapper | 5 |
| Blog post and thread reader | 2 |
| Videos, Watch video sharing, Radio sharing and Radio Studio | 4 |

There are three general social writing implementations in this inventory: [Compose](../ui/src/app/publishing/compose/compose.ts), [full-screen Write](../ui/src/app/publishing/write/write-page.ts), and the [Misskey note composer](../ui/src/app/connections/misskey/misskey-compose.ts). A new feature for all places that publish text has a wider scope. For example:

- [Contact/feedback](../ui/src/app/shell/bug-report-dialog/bug-report-dialog.html) collects a report and chooses a delivery channel, including a private security report.
- [Conversations](../ui/src/app/publishing/conversations/conversations.html) has dedicated bot and Bluesky chat fields alongside the shared Mastodon composer. [Local Compose](../ui/src/app/chat/eliza/local-compose.ts) also supports local ELIZA conversations.
- [Watch party chat](../ui/src/app/reading/watch/party-conversation.html) writes with the current hashtag or reply parent. Watch's separate video-sharing dialog mounts ordinary Compose.
- [Status edit](../ui/src/app/publishing/status-edit/status-edit-dialog.html), [scheduled posts](../ui/src/app/publishing/schedule-mastodon-posts/schedule-workbench.html), and [admin announcements](../ui/src/app/admin/announcements/admin-announcements.html) edit or publish records with their own lifecycle.

The first handoff is enabled on Home's Quick post and the existing Mastodon quote dialog. Extending it to a reply or private conversation needs the receiving editor to preserve the reply parent, recipient and network through publication.

## Start with thread text

The owner picked thread text as the first extraction. It has a small contract a contributor can reason about with a pencil. Given prose, a character budget, and the reserved width of a URL, where can the text break and what will each part cost? Answering that question should take a string and a unit test. It should require no account, editor, or publishing service.

This review sampled the Angular client at `7aae3e5c6` after the namespace reorganization. I used file size to find places to read, then traced individual changes through their callers. The 3,738-line Compose component mixes many responsibilities, but splitting it into smaller files by line count would give a contributor little guidance about where to change a rule. The examples below identify specific decisions that can have one owner.

### What belongs in the library

Write's `autoSplit` and `findCut` live beside editor mode selection, caret handling, and translation keys. They depend on Compose's `postLength` and `findUrls`. Those functions already agree on URL spans and weighted length. Their contract also matters outside either editor, including the bug-report dialog. Bluesky has a genuinely different counting rule: a joined family emoji counts as one grapheme there. Preserve each caller's existing semantics. [Write splitting](../ui/src/app/publishing/write/split-modes.ts) · [Compose measurement](../ui/src/app/publishing/compose/post-length.ts) · [Bug-report dialog](../ui/src/app/shell/bug-report-dialog/bug-report-dialog.ts) · [Bluesky facets](../ui/src/app/connections/bluesky/bluesky-facets.ts)

1. Extract URL recognition, weighted code-point counting, and automatic splitting into `ui/src/lib/thread-text/`. Use the existing function shapes for the first pass. Pass the limit and URL weight from the publishing adapter. Keep platform defaults, shortening offers, manual split modes, caret positions, and translated labels with their current owners. A platform registry would add a decision that none of these algorithms needs.
2. Use the existing app entry points as thin delegates during the move. Carry the pure examples from the two existing specs into the library suite, preserving app-level coverage of mode selection and editor behavior. Check punctuation, multiline prose, non-BMP characters, custom URL weights, and exact-limit inputs. The repository already defines the library manifest, dependency checks, and standalone test runner. [Counting specs](../ui/src/app/publishing/compose/post-length.spec.ts) · [Splitting specs](../ui/src/app/publishing/write/split-modes.spec.ts) · [Library conventions](../ops/engineering/libraries.md)
3. Make the approved behavior correction a distinct change. Running the current `autoSplit("https://example.org tail", { limit: 5 })` returned `["https", "://ex", "ample", ".org", "tail"]`. The cut logic protects a spanning URL only when its start offset is positive. Once that URL leads the remaining text, the fallback can cut through it. The owner wants the intact URL in its own over-limit segment. The expected parts are `["https://example.org", "tail"]`, with only the first flagged by `segmentsFor`. Cover a URL after ordinary prose as well as at offset zero. This exercises the handoff between splitting and the editor's existing over-limit indicator.

The practical completion check is whether someone can change a boundary rule, see the affected examples, and explain what both editors will do without tracing a send operation. The owner described confidence in adding features as the goal. There is no historical velocity baseline for this review.

## Second opportunity: give poll editing one owner

Try answering “what happens when I remove the last optional choice and reopen the draft?” Both Compose and Write implement the two-choice floor, four-choice ceiling, blank initial options, poll snapshot construction, and restoration of short option lists. Write even checks the number of nonblank options at two points in its own publish flow. These are places a future feature can drift while both editors still compile. [Compose, from `togglePoll` through `applySnapshot`](../ui/src/app/publishing/compose/compose.ts) · [Write, including `applyFeatureSnapshot` and `wizardFinish`](../ui/src/app/publishing/write/write-page.ts) · [Draft storage](../ui/src/app/publishing/drafts.ts)

When poll work next touches either editor, give plain poll operations a single home under `app/publishing`. Begin with adding and removing options, determining whether enough options contain text, and restoring options from a draft. Let the editors keep their signals, dirty-state handling, and choice of when to display validation. Exercise both editor entry points with the same saved poll, including a legacy short option list. Keep the existing draft shape. Each editor has legitimate differences elsewhere: Write derives segments from continuous prose, while Compose can carry Bluesky reply references. A common editor superclass would make the poll fix depend on those differences.

## Third opportunity: keep a reader preference together

Trace `readerLineHeight` through `ClientPrefs`. Its optional stored field, signal default of 1.65, setter clamp of 1.2–2.4, hydration, persistence, and CSS assignment occupy six separate places. Font weight follows the same path with different rounding. The loader already reuses the setter for validation, a good property to preserve. The maintenance cost is remembering every stop when adding the next control. [Client preferences](../ui/src/app/platform/storage/client-prefs.ts)

On the next reader typography change, group those two settings' defaults, normalization, and stored-value conversion in a reader-owned module. Let `ClientPrefs` continue to own the storage transaction and expose its existing signals and setters. Test a missing field, an out-of-range stored value, and a save/reload against today's flat keys. Verify the resulting CSS values through the existing application path. Expand to other typography settings only if the next change is easier to trace. A schema language for every preference would be a much larger maintenance commitment.

## A library to defer

Latency histograms look like an easy extraction. Bucket selection and percentile math already live in a standalone module with their own specs. Packing and unpacking zero runs sit in the metrics service and share an on-disk contract with older data. Moving the math alone buys little isolation. Revisit when changing histogram storage or adding a consumer, and use an actual previous encoding as a compatibility fixture before moving the codec. [Histogram](../ui/src/app/observability/latency-histogram.ts) · [Metrics service](../ui/src/app/observability/api-metrics.ts)
