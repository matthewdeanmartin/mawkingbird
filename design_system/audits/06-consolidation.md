# Sprint 6 opening consolidation audit

## Audience copy and power-user page, 2026-10-26

Reviewed 1,191 source files and 249 candidate files; no candidate file added or
removed. `audience-page.html` gains a "Read next" list of help guides and both it
and `features.html` link the new `/for/power-users` page. All four new findings are
MbContentLink anchors (plain `href` for the static help site), so the existing
dispositions stand.

## Public starter-kit pages and help links, 2026-10-26

Reviewed 1,191 source files and 249 candidate files. Added two candidates:
`pages/features/follow-hub.html` and `follow-kit.html`, the prerendered `/follow/`
pages. Both use MbButton and MbContentLink over the feature-page layout plus a
small list stylesheet; no control is restyled. The footer gains a plain Help link
(line shifts only, no new pattern). The welcome modal's two new-tab links are
native anchors styled like the footer's, not buttons, so the two answers remain
its only controls. The More menu's Help row reuses the existing menu link style.

## Prerendered project pages, 2026-10-26

The prerendered project pages (About, Funding, Blog) add one candidate template:
1,184 scanned files and 247 candidate files. `pages/features/public-article.html` is
build-time only, uses MbButton and MbContentLink, and reuses the feature-page
stylesheet without control restyling. In the browser the same URLs still render
the in-app virtual tweets, so no shell control changes. Static and client SEO
browser checks cover all three URLs, including a fresh visitor staying on the
article rather than being dispatched to Home.

## Home and Algo Settings, 2026-10-24

Reviewed 1,159 source files and 240 candidate files. Added one candidate:
`pages/settings/home-algo/settings-home-algo.html`, composed from the Profile
header/body/section pattern with SettingsRow, Field/Control, Checkbox and Button.
Home adds a shared retry action and source-line shifts. Storage truncates labels
while keeping full-key titles and accessible delete labels; its actions cannot
shrink or wrap mid-word. Follows retains a 22px outer inset around its note.
No candidates were removed and no shared widget internals changed. The ledger
records the new page; the Settings recipe makes page composition explicit.

## Post lifecycle regression tests and delete failure handling, 2026-10-24

Reviewed 1,151 source files and 239 candidate files. The delete failure handler
in `status-card/status-card.ts` shifts one disclosure source line. It reuses the
existing action error display; no control or shared widget changed. No candidate
files were added or removed, so `11-reconciliation.json` keeps its dispositions.

## Preserve attachments when editing posts, 2026-10-24

Reviewed 1,151 source files and 239 candidate files. The only inventory change
is a disclosure source-line shift in `status-card/status-card.ts` after retaining
media IDs on Mastodon edits. No controls or shared widgets changed, and no
candidate files were added or removed. The dispositions in
`11-reconciliation.json` remain unchanged.

## Video search, watch parties and menu cleanup, 2026-10-18

Reviewed 1,147 source files and 238 candidate files. One candidate is added:
`pages/videos/watch-parties-page.ts`, a hashtag finder built from Field,
Control, MbButton and Content State that reuses StatusCard for results. The
video search page replaces its stub with real fediverse and YouTube results,
reusing StatusCard and the video player controls. The mode-nav flag is gone, so
the shell keeps one nav. The RSS header loses its Customize link (now the Manage
tab), and Write gains a Manage link beside New in the drafts pane. Remaining
inventory changes are source line shifts. No shared widget changed.

## Five-tab app modes and video search, 2026-10-18

Reviewed 1,144 source files and 237 candidate files. One candidate is added:
`pages/videos/video-search-page.ts` uses Field and Control for its search input
and MbButton for the Google hand-off and post-search link. The mode switcher
drops its MenuSeparator and Manage feeds row because feed management is now an
RSS tab. Bookmarks gains a With video view on its existing native tab buttons,
with no new control type. The YouTube page moves onto the header tracks used by
/rss. Remaining inventory changes are source line shifts. No shared widget changed.

## Fedi videos and watch queue, 2026-10-18

Reviewed 1,143 source files and 236 candidate files for Sprint 2 of
spec/top_level_menu.md. Two candidates are added. `video-player/queue-button.ts`
is one MbButton toggle with aria-pressed, used beside Open Watch on inline
players and in the Watch header. `pages/videos/watch-queue-page.ts` uses Page
Header, Content State for the empty queue and MbButton for Watch, reorder,
remove and clear; clearing confirms through AppDialogs. Watch adds a wrapping
header group of MbButton controls. Fedi videos reuses Home and hides its view
toggles and default picker there. `/videos` adds two MbButton links that
appear only while mode-nav is off. Remaining inventory changes are source line
shifts. No shared widget changed.

## App-mode top menu, 2026-10-18

Reviewed 1,140 source files and 234 candidate files. The flagged app-mode nav
(spec/top_level_menu.md) adds one candidate, `shell/mode-switch.ts`: the mode
menu is an anchored Popover of MenuItem links with a MenuSeparator before feed
management, so the surface, Escape, light dismissal and viewport flipping
(upward from the phone bottom bar) are shared. Its trigger stays a native
button styled as a peer of the primary-nav tab links, as the shell More summary
is, because MbButton presentation would not read as a nav tab. With the flag off
the shell renders its original nav unchanged. The RSS Videos link is wrapped in
a flag check. Remaining inventory changes are source line shifts; no shared
widget changed, so design-verify is not required for this change.

## Video and media usability, 2026-10-18

Reviewed 1,137 source files and 233 candidate files. Subscription diagnostics and
video customization reuse Dialog and Button; video responses select the new wide
Dialog size. Video sorting uses regular Field styling and a native dropdown
indicator. The YouTube preview image is inside its activation button, using the
shared Button's new rounded shape with outline styling. Party post actions replace
repeated buttons with one labeled select; the party tag input uses compact Field
and Button with a horizontally scrollable tag list. RSS adds a settings link.
Remaining inventory changes are source line shifts. No candidate files were added
or removed, so 11-reconciliation.json retains the same dispositions. Shared Dialog,
Button and Field changes require complete design verification and browser assertions.

## Recovery and profile usability, 2026-10-18

The update recovery panel replaces its report button with a native external link
to the production homepage in a new tab, retaining the existing button styling
and retry action. Profile follows-you badges now share the name row with bot
badges, and the self-profile menu uses the existing accessible ellipsis pattern.
Reviewed the regenerated inventory: 1,137 source files and 233 candidate files;
one fewer native button in UpdateOverlay and profile source line shifts. No
candidate files were added or removed, so 11-reconciliation.json needs no changes.
No shared widget implementations changed.

## Compact bio Edit and Preview tabs, 2026-10-18

The bio dialog reuses the Bookmarks tabs/tab/active styling for mutually exclusive
Edit and Preview panels. The native tabs expose selected state, panel associations,
roving focus and arrow/Home/End keyboard handling. Keeping the textarea mounted
preserves its draft, selection and undo history. Both panel heights are bounded;
long previews and the emoji picker scroll within the panel. Dialog, Field/Control
and Button remain unchanged shared widgets. Reviewed the regenerated inventory:
two added native tab buttons and source line shifts, still 1,137 source files and
233 candidates, with no candidate additions or removals.

Production-browser checks used a 14,000+ character bio at 1,366×768, 1,280×720
and 390×844. Edit and Preview both fit without outer dialog scrolling, long preview
content scrolls internally, and Apply stays in view. Keyboard tab changes preserve
the edited draft; Escape dismisses the dialog. Screenshots were reviewed for both
desktop panels.

## Bookmarks Read Later destination, 2026-10-18

Bookmarks adds Read Later beside the existing provider tabs, available without a
Raindrop connection. It reuses the Reader Library panel and its existing ReaderLibrary
and PostAction widgets. Embedded mode removes Close, fills the available width and
uses normal history navigation so Back returns to Bookmarks; Reader mode retains
replaceUrl navigation. Reviewed 1,137 source files and 233 candidates: one added
native tab and line shifts in the two existing templates, with no new or removed
candidate files. No shared widget implementations changed.

Production-browser checks passed at 1,440px and 390px: all three tabs with Raindrop
connected, existing shelves, direct access without a Native bookmarks request,
opening an article and returning to Read Later with Back, and removal surviving a
reload. The existing Reader panel's history behavior remains covered by its specs.

## Notification parity and profile controls, 2026-10-18

Reviewed the regenerated inventory: 1,137 maintained source files and 233 candidate
files. The sole new candidate, ProfileBioDialog, reuses Dialog, Field/Control and
Button for an isolated plain-text editor, emoji insertion, preview and Apply/Cancel.
The profile settings bio now renders its content and opens that dialog with Button.
Notification audience filters retain the existing segmented control layout across
networks, adding Mutuals and Not following. Profile retweet-trust actions retain the
existing menu-row pattern. The server summary is one native external link, and the
mutual-post background uses a darker theme-specific token mix. Remaining inventory
changes are source line shifts; no candidate files were removed. Reconciled the new
dialog in 11-reconciliation.json. No shared widget implementations changed.

Production-browser checks passed at desktop and 390px widths for bio source text,
preview, Cancel/Escape, focus return and overflow. The notification audience controls
fit the phone viewport. The server summary links to the configured homepage. Profile
menu checks confirmed account-only trust leaves retweets collapsed, explicit retweet
trust opens CWs and reveals media, reload preserves it, and account-only trust revokes
that extension. Dark mutual-card contrast measured 13.23:1 for text and 6.87:1 for
muted text with the default dark palette.

## Reachable profile previews and internal destinations, 2026-10-17

AccountPreview uses the existing profile summary as an external anchor for the
shared Popover, with no additional visible trigger. Pointer entry opens the card;
leaving starts a cancellable 400 ms dismissal delay so the card can be reached
across its gap. Keyboard focus opens it, Escape returns focus and moving away
closes it. Window scrolling/resizing dismisses without stealing focus. Browser
checks cover pointer traversal, departure, keyboard access and follow actions.
RSS profile headers use the shared Button for Open in Reader with the original
feed URL in query parameters. Supported Bluesky trend/profile links use existing
Router destinations; unsupported external links keep their existing behavior.
Reviewed 1,133 source files and 231 candidates: line shifts plus shared Button/NavLink
usage; no candidate additions or removals, so reconciliation remains unchanged.

## Video feed actions and My tags default, 2026-10-17

Home and Appearance reuse their existing default-view selects for My tags. Video
feeds use the shared compact Field/Control select for chronological, title and
channel sorting; the existing Button rows contain Refresh, Main feed and Saved
videos. Subscription documentation moves into Help beside its heading. Post
Response uses Dialog and the existing compact Compose with an isolated video
draft, editable title/link/channel hashtag and the Mastodon/Bluesky target picker.
Watch Party links reuse the existing direct-video Watch route; the player retains
the single Open on YouTube link. More and the Feeds landing list expose /videos.
Reviewed all inventory changes: source line shifts, existing shared controls and
new shared Button/Field/Dialog usage in Videos; no candidate files added or
removed (1,132 scanned, 231 candidates). Reconciliation dispositions are unchanged.
Browser checks exercise the real video page, compact help, sorting, saved/main
navigation and editable response dialog at phone width in light and dark themes.

## Reports, profile previews and Home filters, 2026-10-17

My reports now sits within the standard settings body and section, sharing the
heading scale and padding used by What this app counts. Help popover content
explicitly uses body typography instead of inheriting a surrounding heading.
Home adds a My tags toggle using ToolbarButton, with Button controls for retry,
turning the filter off and loading more. Reader and visual feed views are mutually
exclusive. Profile preview lookups begin at the existing hover/focus anchor.
Reviewed 1,132 sources and 231 candidates: existing source line shifts and shared
controls only; no candidate additions or reconciliation changes. Browser checks
cover report alignment/help typography, feed toggles and the hover follow label.
Reader feed posts now use the existing paper foreground/background pairs as a
local palette, including links, metadata, focus and action colors. Mutual tint
uses that same palette; light papers strengthen mutual-post ink to preserve
contrast. Match app continues to inherit the application theme. Browser coverage
checks every reader paper on both light and dark app backgrounds.

## Compact actions and mutual posts, 2026-10-17

Notification dismissal now uses small outline Buttons within the existing wrapping
action row. Composer permissions uses the existing PostAction icon toolbar.
Permission dialog buttons project directly into the shared Dialog footer to inherit
its 8px gap. Mutual posts blend 10% theme text into the application background.
Reviewed inventory changes: existing candidate line positions and shared-control
counts only; no new candidate sources or reconciliation dispositions. Browser
checks cover compact notification actions, composer trigger geometry and footer
spacing at phone width, plus the real mutual status card.

## Post permissions and moderation, 2026-10-17

Reviewed 1,132 maintained sources and 231 candidate files. Two new app
components reuse the existing widgets: PostPermissions uses Dialog, Field/Control,
Button, Help and Notice; report history uses Help and ordinary navigation.
Both have explicit ledger entries. Composer and Write replace their audience
pickers with the same dialog. StatusCard replaces its quote popup with that
dialog and adds MenuItem commands; its remaining legacy menu remains partial
adoption. Notification dismissal uses Button. Neutral post-menu commands and
private likes no longer inherit danger coloring; report and block retain it.
Unused quote-popup CSS was removed, keeping StatusCard below its CSS budget.
Existing candidate line changes were reviewed; no scanner exemptions changed.
Storybook and browser assertions cover cancellation, focus restoration, narrow
layout and the immutable audience of a published post.

## Observability timing and scope, 2026-10-16

Reviewed the inventory after observability changes: still 1,130 sources and 229
candidates, with no additions or removals. Observability retains its existing
controls and reconciliation disposition; unavailable latency values display as
dashes, and the changed findings only move line numbers. Timing sample validation,
server selection and stored route normalization introduce no new controls.

## Composer help and Bluesky media, 2026-10-16

Reviewed the regenerated inventory: 1,130 maintained source files and 229
candidate files, with no added or removed candidates. Compose replaces its
inline Bluesky audience explanation with the shared Help popover; its remaining
controls retain their existing reconciliation disposition. The compact editor
now offers four rows. List conversion uses the existing AppDialogs confirmation
with an explicit notification warning. VideoPlayer retains its existing controls
and shared Help; its findings only move by one line as media source assignment
moves into the playback lifecycle. No shared widget implementations, scanner
patterns, exemptions or reconciliation dispositions changed.

## Profile actions and Bluesky parity, 2026-10-16

Reviewed the regenerated inventory: 1,130 maintained source files and 229
candidate files. Profile adds the shared Dialog for its compact Reply composer;
Reply, Chat and retry actions retain the surrounding native button styling.
Lists and the external Bluesky profile link move into the existing disclosure
menus. Profile remains partial adoption; the native actions and menu focus and
dismissal behavior remain explicit migration work.

Conversations adds a native retry action for starting a private chat and retains
its backlog disposition. StatusCard adds two shared ActionCount placements for
Bluesky engagement and retains partial adoption. The Bluesky reply component now
delegates to the shared app Compose component and owns no lexical control/style
candidates; remove its stale reconciliation entry. This is reuse of the app
composer, not a claim that the composer has completed design-system adoption.
The remaining changed candidates (Compose, import/export and StatusCard
TypeScript) only move finding line numbers. No scanner patterns or exemptions
changed.

The local `make test` gate now runs `design:inventory-check` first, and the
contributor instructions document the regeneration, semantic review and ledger
steps so this CI check is also encountered during ordinary local validation.

## Sprint 19 checkpoint A: post menu widgets, 2026-10-13

Refreshed inventory: 1,130 maintained source files and 230 candidate files.
The two new candidates are shared implementations: `menu/menu-item.ts` and
`menu/post-menu.ts`, whose native Close button implements the widget. The
shared-control pattern now recognizes `mbMenuItem`, `mb-post-menu`,
`mb-menu-group` and `mb-menu-separator`. Popover's line numbers moved for its
`more` trigger and `list` layout. No app consumer changed; StatusCard
integration waits for review. See [Sprint 19](19-post-menu.md).

## Post menu close row and long tag lists, 2026-10-13

Refreshed inventory: 1,123 maintained source files and the same 228 candidate
files. StatusCard's three legacy ••• panels gain a final native "Close menu"
row, because the phone bottom sheet can cover its own trigger. TagMuteMenu keeps
one row per tag up to four; five or more collapse behind a native toggle row
(`aria-expanded`/`aria-controls`) that reveals a scroll-bounded list. Both are
new native buttons in already partial-adoption files; they follow the menu's
existing row styling and wait for the same shared menu-item control. The
remaining inventory diff is moved line numbers. The previous entry's ••• glyph,
saved as Windows-1252 bytes in this file and the reconciliation ledger, is
re-encoded as UTF-8. No other changes.

## Post menu tag-mute rows, 2026-10-13

Refreshed inventory: 1,123 maintained source files and the same 228 candidate
files. The popup-menu fix replaced Button in `tag-mute-menu.ts` with native
buttons styled as ••• menu entries, so its shared-control finding is gone and
the native-button line moved. The ledger entry changes from adopted scope to
partial adoption until a shared menu-item control exists. No other changes.

## Feeds, notifications, writing and server emoji, 2026-10-12

Reviewed the refreshed inventory: 1,123 maintained source files and the same
228 candidate files. Feed categories retain their existing navigation and now
reflect configured connectors. Notification reply stars use PostAction with
pressed and disabled states. PostActions owns an opt-in narrow alignment;
StatusCard selects end alignment at 480px while wider layouts retain start
alignment. The Write workspace uses its own container width to collapse side
panes without losing their toggles. Custom emoji rendering preserves text-sized
inline images and keeps the picker lazy. Existing candidate dispositions remain
unchanged.

## Search, media pagination and exclusive lists, 2026-10-11

Refreshed the inventory after reviewing the changed search, media viewer and
list templates. List only uses Button with pressed state; its explanation uses
Help, and both add-to-list dialogs use Badge and Help to surface exclusive lists.
The media viewer reuses its existing Next arrow geometry for end-of-page loading,
retaining the counter control and adding a disabled loading state. Search keeps
the existing tag actions beside a short empty-result label. Existing candidate
dispositions remain unchanged; no new component family or styling escape was added.

## Account traffic rollout, 2026-10-11

Regenerated the inventory for MawkingbirdAccess and RequestCooldown: 1,122
maintained source files scanned, with the same 228 candidate files. These two
service modules introduce no controls or styling. Candidate findings and all
existing dispositions remain unchanged; the inventory gate remains enforced.

## Compact feed selects, 2026-10-10

Field now offers an opt-in compact density for native selects outside button-only
toolbars. Home Default and Everything share the existing Everything presentation:
content-sized width, small text, transparent borderless control, compact padding,
hover and visible keyboard focus. The shared compact style removes the native
chevron; regular form selects keep their existing appearance and dimensions.
My languages keeps its existing shared PostAction trigger. Home owns only the
narrow-screen visibility rule; its former select styling and fixed default-control
width are removed. The Field story and browser cases cover geometry, labels,
keyboard selection, Tab order, themes and RTL. Refreshed the source inventory;
existing candidate dispositions remain unchanged.

## Feed browsing and bug-fix reconciliation, 2026-10-10

Regenerated the inventory after Other Servers, feed pinning, profile previews,
image-view pagination, follow-request actions and Home/Appearance controls:
1,112 maintained source files scanned, 226 candidate files. Reviewed the 15
changed candidate files; most findings move with template lines. Other Servers
is the sole new candidate and is recorded as partial adoption: Field/Control
owns search and domain inputs, Button owns browsing, and directory navigation
retains the existing Feeds row pattern. Server-feed pin/retry buttons also move
that template to partial adoption; remaining navigation controls stay explicit
review work.

AccountPreview now uses the shared Popover and embedded AccountHoverCard with
up to three pinned posts. Its ledger reflects top-layer placement, pointer
transfer, dismissal and focus return rather than an inline expanding preview.
Existing dispositions for the remaining touched surfaces are preserved.
Appearance's account-scoped Home Default select retains native semantics and
an explicit label; AI controls move below Analytics. The toolbar browser checks
use the requested Text and Doctor names while retaining their reversible-state,
keyboard and destination assertions. No scanner or reconciliation gate was
relaxed, and this refresh does not claim full control migration.

The full browser run also found that the identity story API fixture lacked the
new pinned-post read used by AccountPreview. The fixture now supplies three
pinned posts, and the existing profile/follow/dialog cases assert they render
while retaining their console-error, focus-return and interaction checks. The
desktop hover check targets the current suggestion-name link rather than the
removed hover-anchor wrapper. The narrow story finishes scrolling its trigger
into view before opening the scroll-dismissed popover; interaction assertions
remain unchanged.

## Optional help and video playback, 2026-10-07

Added `mb-help` to the shared-control scanner and regenerated the inventory:
1,106 source files scanned, 225 candidate files. The new help component composes
the existing popover; the video player, lazy player host, and Watch page use
shared actions and retain native media/select semantics. The reconciliation
ledger now covers these four new candidate files. Existing dispositions stay
unchanged; shifted findings reflect the video-player integration and help copy
moving into a popover. This refresh does not claim all controls are migrated.

Temporary Watch hashtags adopt Field/Control, Button and Help; the post menu
lazily opens a filter dialog using Dialog, Field/Control, Checkbox and Button.
The ledger includes all three new surfaces, preserving existing dispositions.
Home's default dropdown retains native select semantics and an explicit label.

## Home diagnostics and maintenance reconciliation, 2026-10-07

Regenerated the control inventory after Home stopping-state and retry controls,
Feed Doctor provenance, and the recent compose, RSS, proxy-notice, footer and
shell changes. It scans 1,090 maintained source files with 218 candidate files.
Home keeps its existing controls and migration disposition; this refresh does
not claim additional shared-widget adoption. Removed only the reconciliation
entries for the deleted anonymous settings and starter-kit-post templates from
the dead-code cleanup. All remaining candidate files retain their dispositions.

## Public SEO pages and footer follow-up

The feature-reference navigation now resolves fragments against its own pathname
so the root base tag cannot send section links into the app. Its footer adds the
six shared public-page links using MbContentLink. The inventory diff contains
only these adopted links and their shifted template lines; no custom controls
or styling exceptions were introduced. SEO browser checks require section links
to scroll within the same document with JavaScript enabled and disabled.

The five audience landing pages add four source files and one candidate template:
1,097 scanned files and 220 candidate files. The shared audience template uses
MbButton and MbContentLink, reuses the existing feature-page layout without
control restyling, and keeps discovery in public pages and footers. Route
metadata is shared between browser and prerender builds; copy is lazy-loaded.
Desktop/mobile and JavaScript/no-JavaScript SEO checks cover every audience URL,
while the root regression continues to require an empty client-entry body.

The root-entry correction removes the signed-out summary component and its
reconciliation entry: 1,093 source files scanned, 219 candidate files. Public
feature content remains at `/features`; social metadata stays in the document
head. Neither prerendered root HTML nor preview startup shows a marketing page.
The inventory change is the deleted summary's shared controls, not an exemption
or a change to the remaining public page's design-system contracts.

The October 4 SEO follow-up reconciles five additional source files and updated
footer line numbers: 1,094 source files scanned, 220 candidate files. The public
feature reference and signed-out summary now use MbButton for call-to-action
links, MbContentLink for ordinary links, and MbNavigation/MbNavLink for the
feature-area fragment navigation. Native href/routerLink semantics, public
content, and machine-only identity metadata remain intact. Page CSS owns layout
and spacing; it no longer duplicates button colors, padding, typography, radii,
or link treatment. The illustration surface uses the existing theme token.

The footer's new feature link uses MbContentLink; other legacy footer controls
remain explicitly partial adoption in the reconciliation ledger. Legacy footer
color/hover selectors exclude the adopted link, preserving shared contrast and
focus treatment. No whole-page
or directory exemption was added. Refreshing the inventory alone would fix the
reported stale-source gate, but would leave the public pages' custom pill style
outside the approved button contract.

The complete browser gate also exposed fixture drift outside the SEO pages.
Server selection's isolated story disables initial router navigation to avoid
matching Storybook's iframe URL against an empty route table. Narrow settings
checks open the real mobile drawer before inspecting navigation, and verify
Escape dismissal and focus return. Picker checks cover both local-network and
community suggestions, their active-descendant/selection states, and keyboard
selection of the intended community server. The original browser cases and
assertions remain; no error filtering, test removal or retries were added.

## Navigation and identity follow-up

Nine rail/identity/server-selection consumers adopt shared presentation and
existing DS controls. The scanner visits Angular switch-case groups as well as
branches/loops/deferred alternatives; current usage is 797 placements in 88
templates, 37 of 40 widget types. The inventory scans 1,084 source files and
lists 216 candidate files. The profile-stack CSS candidate is removed because
its `::ng-deep` escape was replaced with namespaced projected styles; the
template remains accounted for. These numbers include corrected source counting,
not only new adoption. See [review and scope](navigation-identity.md).

## Reader presentation follow-up

Preferences, library chrome/rows, Find fields/results and notes/selection surfaces
now use four reader-specific presentation components. Five consumers retain their
native markup and reader-owned behavior/placement. The inventory scans 1,067
source files with 217 candidates; adoption is 735 placements in 79 templates,
using 29 of 32 widget types. The three partial reader templates are reconciled
for this presentation scope, not for reader-core or all reading experiences.
See [preservation evidence](reader-preservation.md); earlier counts below are
historical checkpoints.

## Pixel and reader control follow-up

Mobile post density now covers the 720px app breakpoint with explicit compact
target geometry. Five reader control templates adopt shared compact commands;
their layout, storage, pagination and selection behavior remain intact. Source
adoption is 730 placements in 79 templates, using 25 of 28 widget types. The
refreshed inventory still covers 1,062 source files and 217 candidate files;
the reader ledger distinguishes adopted action scope from remaining specialized
fields, library rows, search results and reader-core controls.

## Phone post toolbar follow-up

The October 2 compact-count batch scans 1,062 source files and retains 217
candidate files. StatusCard uses shared compact metrics and narrow-screen action
labels, without changing provider capabilities or removing commands. Exact count
text, account-list actions and touch targets remain. The refreshed source report
records 702 placements in 74 templates, using 25 of 28 widget types. These are
source-adoption counts, not a claim that all candidate files are migrated.

## Button consistency follow-up

The October 1 button batch refreshes the inventory to 1,058 source files and
215 candidate files. MbButton and legacy action classes now share one canonical
stylesheet; component CSS no longer owns pill colors or sizing. Import/export
direction selection uses RadioGroup; compact Algo, Thread, Drafts and Write
actions use PostAction. Additional login, onboarding, follow and analytics
actions adopt MbButton. See [button review](../REVIEW-buttons.md) for scope and
verification. Historical sprint counts below describe their original checkpoints.

## Scope and accounting

`npm run design:audit-controls` scans all maintained `ui/src/app` HTML, non-spec
TypeScript and CSS, including public entry points and admin. The checked-in
[control inventory](06-control-inventory.json) records source paths and line
numbers: 1,051 files scanned, 205 with lexical control/style candidates.
Comments and inline templates can produce candidates. These numbers are neither
violations nor adoption percentages. Every non-library candidate remains marked
**needs semantic review** until its behavior is inspected. No blanket exception
or invented migration count is assigned to the remaining files.

The following reconciles known patterns; it does not pretend the entire source
inventory has already received a semantic audit.

| Evidence                                                                                   | Status / risk                                                                               | Next step / owner                                                                  |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `command-bar`, Home filter controls, reader size controls; `audits/03-toolbar-adoption.md` | Adopted toolbar batch; retain compact density correction                                    | Keep existing browser coverage; DS maintainer                                      |
| Analytics checkbox in chooser/Login/Privacy; `audits/03-compact-correction.md`             | Adopted alignment correction                                                                | Preserve actual save ownership; DS maintainer                                      |
| `pages/login/login.html:330`, `.css:318` registration agreement                            | Pending checkbox migration; text and registration semantics distinct from analytics consent | Sprint 1 backlog; preserve ngModel and consent behavior                            |
| `pages/settings/privacy/settings-privacy.html:15,35,59,118`                                | Remaining native checkbox candidates; page save behavior must survive                       | Sprint 1/2 backlog; inspect each before migration                                  |
| `admin/announcements/admin-announcements.html:10`, `.css:25`                               | Publish toggle has local flex/gap layout                                                    | Candidate for approved checkbox; admin maintainer reviews submit/publish semantics |
| `admin/ip-blocks/admin-ip-blocks.html:8`, `admin/domains/admin-domains.html:9`             | Native selects and add forms                                                                | Candidate for field/control contracts; preserve labels and server failure state    |
| Existing dialogs and popup consumers; `audits/04-overlays.md`                              | Approved preview, app integration pending                                                   | Sprint 4 backlog; focus/async parity before deletion of legacy CSS                 |
| Metadata and content states; `audits/05-content.md`                                        | Ordinary preview accepted; integration pending                                              | Sprint 5 backlog; preserve media/HTML, translations and scroll stability           |
| `status-card/status-card.html:448` reader links commented out; `:493` unified-share menu   | New full-tools preview closes a known mixed-action gap                                      | Review `MbPostActions`; no production preference/behavior changed                  |
| Structured compose errors, verified badges, provider/ownership-specific commands           | Specialized contracts; not safe to flatten                                                  | Retain pending explicit parity review, not a permanent blanket exception           |

## Enforcement begun

- Existing Angular template lint now rejects pill styling in `mb-post-actions`
  as well as `mb-toolbar`, with replacement guidance and positive/negative tests.
- Scoped CSS rules cover new post-action/count styles; raw palette literals and
  styling escape hatches remain forbidden in shared widgets.
- `design:verify` checks that the source inventory matches, then checks types,
  formatting, CSS contracts, builds Storybook and runs browser assertions.
- The client-build workflow has a separate design-system job using existing
  pinned checkout/setup actions, Node 22, `npm ci`, pinned Playwright and Chromium.
  It runs lint and `design:verify`. No deployment configuration changed.
- Browser layout/interaction/contrast checks become a CI gate. Screenshots remain
  review artifacts rather than pixel-diff baselines. Local commands were tested;
  the new hosted job still needs its first GitHub run.

## Ownership and remaining work

Each change to an adopted widget belongs to its author and reviewer: update
stories, run `make design-verify`, run affected app tests, and reconcile the audit.
Run the LLM protocol after shared-widget changes and at each sprint boundary;
review the inventory monthly during active UI work. The repository maintainer
owns assigning a human reviewer; no person has been silently assigned here.

Sprint 6 remains in progress. Finish the semantic inventory, review this new
mixed-action variant, migrate eligible consumers in small tested batches, then
remove duplicate CSS. Earlier preview approvals are retained; outstanding app
integration is not hidden by the sprint number. Completion requires recorded
consumer counts and parity evidence, not just a green catalogue.

## Subsequent adoption

[Sprint 7](07-checkbox-adoption.md) resolves the four listed Privacy checkbox
candidates and Admin Announcements' publish toggle: five production controls now
use the approved widget. Registration consent and the other opening findings
remain pending. See Sprints 8–11 for the next bounded adoption batches.

[Sprint 8](08-forms-adoption.md) subsequently resolves registration consent and
17 admin form controls. The seven-screen batch now uses the approved checkbox,
field/control and button widgets. Remaining row actions, other Login fields and
list states remain open inventory findings; this is not whole-screen completion.

[Sprint 9](09-dialog-adoption.md) adopts three production dialog implementations:
shared confirmation/prompt, Leave and Translate. Its audit lists service/direct
consumers and the individually deferred Effective Audience layout, destructive
button and consequence-card variants. Legacy overlays are not globally exempted.

[Sprint 10](10-navigation-and-states.md) adopts 18 template consumers in Settings
navigation, Public Timeline and List Timeline. Shared states now distinguish
failed reads from empty results, retain posts through refresh/pagination retry,
and preserve current-route marking with query parameters. Search's richer
results and remaining list controls stay explicit migration debt.

[Sprint 11](11-post-tools-and-enforcement.md) adopts 40 post-row/count/notice and
nested-library consumers. Its ledger accounts for all 209 current candidates,
including 165 explicit backlog files. Candidate patterns now include navigation
and remaining shared widget names; counts are not adoption percentages. Lint
protects adopted post actions, and the gate rejects missing ledger entries.
Deep semantic reconciliation of the backlog remains work, not an exception.

[Sprint 12](12-post-dialogs.md) adopts 16 modal/state/action consumers in the
account-list, history and sign-in dialogs. Three candidate templates move from
backlog to adopted scope; the ledger retains 162 explicit backlog files. The
obsolete sign-in stylesheet is removed, accounting for the source-file decrease.
Native link actions now reuse the approved solid/outline button appearance.

[Sprint 13](13-bookmark-and-report.md) adopts eight consumers in bookmark/report
forms. Their two templates become partial adoption, with specialized choice cards
and destructive action styling retained as explicit work. The ledger now has 160
backlog files. Native dialog and retained-report behavior have browser coverage.

[Sprint 14](14-list-membership.md) adopts 22 shared placements in ListDialog.
The ledger moves its template to partial adoption: 159 backlog files remain.
Read-state recovery stays explicit debt. Badge gains its first app consumer;
source usage is 17/27 widget types and 183 placements in 26 templates.

[Sprint 15](15-settings-forms.md) adopts 13 placements in Privacy and Trust settings.
The ledger now has 19 partial and 158 backlog files. RadioGroup and SettingsRow
gain app consumers; source usage reaches 19/27 types and 196 placements in 27 templates.

[Sprint 16](16-post-menus-and-disclosure.md) adopts four placements in RSS feed
actions and post poll statistics. Both scoped templates are adopted: 10 adopted,
19 partial and 156 backlog files remain. Source usage reaches 21/27 types and
200 placements in 29 templates. Privacy's compact-column correction changes
inventory line positions, not adoption counts. Mixed-content post menus remain
explicit backlog; specialized poll charts remain purpose-specific content.

[Sprints 17–18 combined](17-18-final-batch.md) add eight placements and replace
three RSS popup/action placements with direct compact actions. Source usage is
24/27 types and 208 placements in 30 templates. Ledger: 10 adopted, 20 partial,
155 backlog, plus 15 shared and 9 lexical-only candidates. Shared local-tab lint
is enabled for the migrated client-list template. Zero sprints remain in this
plan; the explicit app migration backlog is not complete.

Notification preferences now live under Content → Notifications, outside the
Appearance/Blue controls. The new page adopts PageHeader, three SettingsRows,
and four Field/Control pairs, with shared labels, hints and validation feedback.
The inventory and reconciliation ledger include this adopted scope; existing
preference storage and delivery behavior remain unchanged.

Profile link helpers adopt Dialog, Field/Control and Button for both website and
other-profile forms. The metadata rows also adopt labelled shared fields and
buttons, while the rest of the Profile form remains partial adoption. Helpers
reuse blank rows, preserve existing details and defer publishing to Save changes.

Profile rows now use Field's opt-in visually hidden labels to retain compact
editing and accessible names. The two helper buttons remain available at the
four-row limit; each dialog explains the limit and blocks adding, including form
submission, until a row is removed. Guided dialog labels remain visible.

Writing's publish wizard and vocabulary fields adopt shared two-column settings
rows. Wizard checkboxes, vocabulary inputs, actions and saved feedback use the
design system; preference semantics and the upper sections remain unchanged.

Privacy's posting defaults now use full-width SettingsRows for visibility,
media and language. Only the select fields retain a width cap, so the containing
rows no longer trigger the narrow-screen stacked layout on a wide page.

Write's posting-language question adopts Dialog, Field/Control and Button,
including an Other language field for custom tags. Both schedule controls use
the shared Button for Now, which clears the scheduled timestamp.

## Settings bug fixes, 2026-09-29

Connections uses shared local tabs for Basic and Advanced. The filter wizard uses shared buttons and fields; suggested hashtag selection uses shared checkboxes and buttons with results in place. Removed the network outage report action. Regenerated the control inventory, preserving existing classifications and recording the new wizard.

## Recent feeds and tour choices, 2026-10-04

The Feeds directory's five recent slots reuse Navigation/NavLink for individual
feed shortcuts and Button for pin toggles. Empty recents are hidden; category
shortcuts, a visible heading and explanatory copy are excluded. The catalogue
below retains its existing rows. The tour reuses its existing
choice tiles for Zen mode. Regenerated the control inventory; all existing
candidate dispositions remain in place.

Settings adds a phone-only trigger at 600px and below, reusing its existing
navigation template inside Dialog's bounded drawer presentation. Tablet and
desktop layouts keep their existing breakpoints and sidebar. The shared drawer
retains native modality, focus restoration, Escape/backdrop dismissal and scroll
locking; the caller closes it on navigation and when the viewport widens.

## Video feeds

The video reader and shared subscription panel use MbButton for actions and the
existing VideoPlayer for explicit embed playback. Labelled native channel/search
fields, checkbox, result-type select and navigation links remain partial adoption
backlog. Regenerated the inventory for the release and classified both new
control-bearing files, preserving all existing dispositions.

## Notification reply actions

Reply favourites reuse the small PostAction at the end of the existing mention
toolbar, with a visible Star/Like label and the configured star/heart icon.
No count is rendered. Regenerated the control inventory while retaining the
existing notification-page disposition.

## Profile slideshow and bot identity, 2026-10-17

The profile slideshow uses shared Button controls for playback, speed, full screen,
history loading and content-warning reveal. Profile overflow entries retain the
existing native menu pattern. Public profile settings use Checkbox for the server
bot flag; the profile heading renders the existing badge class. Reviewed the
regenerated inventory: the slideshow template is the only new candidate file;
profile and settings changes otherwise shift existing source locations. No shared
widget implementation changed. Preserve keyboard navigation, Zen hold cleanup,
readable overflow and the sensitive-content boundary during subsequent changes.

## Profile automation layout and account labels, 2026-10-17

Moved the bot checkbox into the final Account type section, using SettingsRow
for the Automation heading and the shared Checkbox in its control column.
Reviewed the regenerated inventory: only profile-settings control locations and
the added SettingsRow finding changed; no candidate files were added or removed.
The account menu now prefers display names and then handles, with an explicit
unavailable label only when neither is known. Shared widget code is unchanged.

## Thread warnings and profile overflow, 2026-10-19

Thread cards share the viewer's CW fold choice across ancestors and replies,
including other authors. Profile overflow panels anchor to the full profile-top
row and wrap within its width. Reviewed the regenerated control inventory: only
existing thread template and status-card source locations moved. All 238 candidate
files retain their existing dispositions; no reconciliation entries were added or
removed. Shared design-system widgets are unchanged.

## Account picker and scrolling account menu, 2026-10-21

The shell account menu caps its height to the viewport and scrolls the switch
list alone, keeping the current account and add/log-out actions in view. With
six or more saved choices it adds a compact Field/Control (label visually hidden)
filter and a link to the new full-page picker at `/switch-account`. The picker
uses Page Header, Field/Control and Button; account rows stay native buttons like
the menu's switch rows. Reviewed the regenerated inventory: the picker template is
the only new candidate file (reconciled as partial adoption); shell findings gain
the filter field and otherwise shift source locations. Shared design-system widget
code is unchanged.

## Radio discovery and synthetic media search, 2026-10-25

Radio uses the existing mode switcher and primary navigation for Player and
Studio. Its source form uses Field/Control, actions use Button, and loading,
empty and failure messages use Content State. Results reuse StatusCard, including
audio previews and content-warning handling. Synthetic search adds a shared
Button for scan cancellation, a retry action for an interrupted first page, and
live progress text.

Reviewed the regenerated inventory: Radio's template is the sole new candidate
file; no candidate files were removed. Search gains cancel and retry actions; remaining
changes shift search and syntax-help source locations. Reconciled Radio as
adopted scope. Shared design-system widget implementations are unchanged.

## Continuous Radio playback and formatting, 2026-10-25

The full Radio player and persistent dock reuse Button; seek and volume use
native ranges within Field/Control. Fullscreen follows the slideshow's viewport
fallback and ReadingZen hold, released when the view closes while audio remains
owned by the session. Transport keyboard shortcuts apply within the player;
native controls retain their own keyboard handling. The compact dock wraps at
phone width and clears the bottom navigation; the shell reserves content space.

Reviewed the regenerated inventory: the controls template and dock are the two
new candidate files, both reconciled as adopted scope. Radio discovery adds the
play action and shell template findings only shift source locations. No files
were removed. The authorized formatting cleanup has no further inventory
changes. Shared design-system widget implementations are unchanged.

## Radio Studio and source alignment, 2026-10-25

Studio uses Field/Control for local audio selection, post text, description,
content warning and visibility; Button for scanning, refreshing, previews and
publication; and Content State for errors. Native audio provides seekable local
preview. Saved post references form a bounded scrolling list, and post previews
reuse StatusCard. Radio source fields now align at their labels so account help
text does not push the adjacent source label down.

Reviewed the regenerated control inventory: Studio's template is the sole new
candidate file, reconciled as adopted scope. The Radio page removes its Studio
placeholder and otherwise shifts source locations. No candidates were removed.
Shared design-system widget implementations are unchanged.

## External audio discovery and players, 2026-10-25

Provider activation and close actions reuse Button. External frames remain
labelled, responsive and explicitly loaded, with original-link fallbacks and
visible errors. StatusCard preserves content-warning and sensitive-media gates;
Radio offers provider choices using Button and keeps active controllable widgets
visible in its persistent dock. The dock measures its height to reserve content
space. Search adds provider and delivery facets through existing facet controls.
Radio discovery defaults to external players as well as native audio; the shared
Checkbox offers an explicit native-only filter and clears previous scan results.

Reviewed the regenerated inventory: external-player-host.ts and external-player.ts
are the two new candidate files, reconciled as adopted scope. Radio gains provider
choices, StatusCard gains reveal controls, and other findings move with source
lines. No candidates were removed. Shared design-system widget code is unchanged.

## Shareable Radio and additional players, 2026-10-25

Radio sharing reuses Button with a live status message. Public audio post menus
reuse MenuItem router links, preserving keyboard and normal link behavior.
Author again leads search facets; provider and delivery follow Media. Amazon
Music, Deezer and Internet Archive reuse the existing explicit-load player.

Reviewed the regenerated inventory: the Radio page adds one shared copy action;
StatusCard adds three menu links and remaining findings shift with source lines.
No candidate files were added or removed; reconciliation remains complete.
The new pure URL helper adds one scanned file without controls. Shared widget
implementations are unchanged.

## Discoverable Radio entry actions, 2026-10-25

Profile account menus use MenuItem for a qualified-account Radio link. Eligibility
excludes non-Mastodon profiles. Posts now also expose a visible Button link beside
media, preserving content-warning and sensitive-media boundaries and the existing
menu entry. Both routes remain shareable and preserve the deployment base.

Reviewed the control inventory: profile menu links and the visible post link are
the added controls; other findings shift source locations in those components.
No candidate files were added or removed, so reconciliation remains complete.
Shared design widgets are unchanged.

## Compact audio toolbars and aligned dock, 2026-10-25

Post audio actions now use the same compact Toolbar/ToolbarButton as Home,
between content/media and Post Actions. Radio passes queue commands into that
row; lazy external players expose load/close/open commands without duplicating
pill buttons. Content-warning and sensitive gates remain intact. Scan continuation
precedes its progress count. The dock and full player use compact transport
controls, with provider open/close in the dock row; close follows Stop Radio.
The fixed dock measures the centre column across rail and viewport changes.

Reviewed the regenerated inventory: control replacements and location shifts
are confined to the audio/player surfaces, plus the preceding profile/post entry
changes. No candidate files were added or removed; reconciliation stays complete.
Shared design-widget implementations are unchanged. Browser checks cover toolbar
placement, dock bounds on desktop/tablet/mobile, control order and continued playback.

## Radio discovery, saved playlists and player views, 2026-10-25

Radio now uses Navigation/NavLink text tabs for Search, Playlist, Radio and Studio.
Playlist editing reuses Field, Button, compact Toolbar and ToolbarButton; source
eligibility uses Checkbox and the existing Help popover. Post actions separate
adding from playing. The Copy Radio Link button is removed in favor of the URL.
The persistent dock remains mounted inside the centre column and becomes an
ordinary in-flow full player on the Radio tab, preserving the provider iframe.
Full-player queue choices and transport actions use the compact toolbar style.

Reviewed the regenerated inventory: the added controls are the playlist forms,
navigation, help/filter controls and post Add action. Other findings are source
line shifts in these same audio surfaces. There are still 246 candidate files;
none were added or removed, so 11-reconciliation.json needs no candidate changes.
The new playlist service has no controls. Shared widget implementations remain
unchanged. Browser checks exercise the tabs, help/filter, saved playlists, URL
sharing, centre-column bounds and playback continuity without a duplicate overlay.

## Radio listening flow, 2026-10-26

The persistent dock is now an opaque, sticky now-playing bar at the bottom of
the centre column, in normal flow. The fixed overlay, its ResizeObserver
alignment, the `--radio-dock-space` padding and its `!important` width override
are removed; the dock's former styling escape disappears from the inventory.
Transport and playlist-row actions remain compact ToolbarButtons, now holding a
local decorative SVG icon (`radio-icon.ts`), with the accessible name in
`aria-label` and a matching tooltip. Provider consent uses Button. The text-only
page-level Radio toolbars are unchanged and remain a follow-up.

Reviewed the regenerated inventory: apart from line shifts in the audio, status
card and shell surfaces, the only change is the removed dock styling escape.
There are 249 candidate files, as before; the new icon, title, and handoff files
have no candidates, so 11-reconciliation.json needs no candidate changes. Shared
design-widget implementations are unchanged. Browser checks cover dock bounds on
desktop, tablet, and mobile; provider consent and autoplay; the folded frame; and
control order.

## Radio settings and Studio composer, 2026-10-26

Radio gains a Settings tab that reuses Settings Row, Checkbox, Button and a
Field/Control range. Page-level playlist actions use Button, with drafting moved
into the existing post-menu overflow. Saved playlists use the same icon-row
treatment as playlist tracks. Studio leaves the Radio tabs for its own
top-level page. That page has Navigation tabs for the new post and the
catalogue, a recording panel (Field/Control, Button, Content State), and the
shared Compose component in place of Studio's own text, warning and visibility
fields.

Reviewed the regenerated inventory. `radio-studio.html` loses the publication
fields now owned by Compose, and `radio-page.html` loses the Studio tab and the
text toolbar. `studio-page.html` and `radio-settings.ts` are new candidate files
(251 in total), each reconciled as adopted scope in `11-reconciliation.json`.
Shared design-widget implementations are unchanged; Compose gains only a public
method for attaching already-processed media.

## Linked audio files, 2026-10-26

Status cards play linked audio files (direct files, Wikimedia file pages and
Internet Archive downloads) through the same native `audio` markup as
attachments, with `preload="none"`. Radio resolves Library of Congress items
without new controls. Reviewed the regenerated inventory: only source-line
shifts in the status card and Radio surfaces. There are still 251 candidate
files, and shared widgets are unchanged.

## Playlist threads and the full-player gate, 2026-10-27

The full player covers its controls with an overlay while an external provider
player is not ready, offering one Button (allow or load) or a status line, and
makes the controls below `inert`. The Playlist tab adds a description
Field/Control, a Rename icon ToolbarButton per entry, a thread-publication
section (visibility select, plan text, publish/update Button, progress and alert
lines), and Find/Adopt Buttons for existing playlist threads. "Save as a new
playlist" joins the post-menu overflow.

Reviewed the regenerated inventory: the added candidates are these controls in
`radio-controls.html` and `radio-page.html`, with line shifts elsewhere. There
are still 251 candidate files, both entries are updated in
`11-reconciliation.json`, and shared widgets are unchanged.

## Listen page, 2026-10-27

The new single-recording page `listen-page.html` reuses Button, Field/Control
(the position range), StatusCard (the post and its indented comments) and the
lazy external-player host. Status cards add "Open in Listen" as menu items in
their three ••• menus, and as one compact ToolbarButton on audio posts that
Radio cannot play continuously.

Reviewed the regenerated inventory: the added candidates are those entries in
`status-card.html` and the new `listen-page.html` (now 252 candidate files),
reconciled as adopted scope in `11-reconciliation.json`. Shared widgets are
unchanged.
