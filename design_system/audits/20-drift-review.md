# Drift review, 2026-11-24

What recent features built that the design system should own. Review only: no
app code changed. Guidance that came out of it: [Action rows](../action-rows.md).

## Method

- Parsed app templates (external and inline) with the Angular compiler. Excluded
  `design-system/`, localized copies of public pages, and specs. "Peak" counts
  what can show at once, taking the largest `@if`/`@switch` branch.
- Counted declarations in component CSS outside `design-system/` and `lite/`.
- Rendered pages from a dev server at 1440px and 390px in Chromium: light theme,
  signed in, fixture data, external network blocked. Dark theme, other accents,
  RTL and Native were not looked at.

Source counts are candidates, not confirmed defects.

## The headline: the quiet weights exist and nobody uses them

| Weight                                    | Placements |
| ----------------------------------------- | ---------- |
| Outline pill (`mbButton` 497, `.btn` 324) | 821        |
| Solid pill (`mbButton` 301, `.btn` 164)   | 465        |
| `link`                                    | 77         |
| `compact`                                 | 24         |

93% of buttons are the two loudest weights (15 with a bound variant not counted).
`mbButton` defaults to `solid`, so the loudest choice is the one you get by not
choosing. 72 rows can show three or more pills at once, 27 show four or more, 8
show five or more, and 39 rows inside an `@for` hold at least two each.

| Page, as rendered           | Pills in the main column |
| --------------------------- | ------------------------ |
| `/videos`, 4 videos         | 26                       |
| `/admin/accounts`, 3 people | 20 (12 solid red)        |
| `/videos/queue`, 4 rows     | 17                       |
| `/playlists/:id`, 3 rows    | 5, none in the rows      |
| `/singles`, 3 rows          | 2, none in the rows      |

The queue and a playlist are the same screen: an ordered list you play, reorder
and prune. Radio answered it with icons, Video with capsules.

The ledger cannot see this. It calls `watch-queue-page.ts` and
`profile-slideshow.html` **adopted scope**, because every pill there is a shared
pill. Adoption measures which widget, not whether it was the right one.

## Candidates, best first

### 1. Item row, from Radio

`reading/radio/radio-lists.css` (`.rows`, `.row`, `.track`, `.track-meta`,
`.row-actions`) plus a compact embedded toolbar is the best list in the app:
title, muted line, actions at the end, dropping under the title on a phone.
Extract it as `mb-item-row` with picture, title, meta and action slots.

First consumers: Singles, Playlists, a playlist's tracks, the watch queue and its
Recent list, video subscriptions, `track-result`. Later: pastes, drafts, links,
outbox, RSS feeds, account lists, filters.

### 2. One icon set

Three sets drawn separately: `radio-icon.ts` (20), `watch-actions.ts` (11), and
shell and mode-switch inline paths. Share and open are drawn differently in each, at
different sizes and stroke widths. Elsewhere the same jobs use characters: ✕ (32 lines)
and × (31) for close, ← (25), ↻ (6), and emoji. Patterns 3 and 4 in Action rows
depend on this, so it comes first with item 1. Keep it a leaf import: the shell
must not carry every glyph in its initial bundle.

### 3. Labelled actions, from Watch

`app-watch-actions` (icon and word, no box, buttons and links together) is what
cards need. It is already generic except for its name and icon table. Promote it
to the design system over `mb-post-actions`; adopt on Videos, video search and
Listen.

### 4. Add box: an input and its button

61 places pair one text input with one button; 26 use an unstyled input. This is
the YouTube subscribe box. Some of the 61 are poll options or dates and will not
fit. `mb-add-box`: an `mb-field` with the button attached on the same line,
wrapping under it when narrow, with hint, error and busy slots.

Decide once what the button does while the box is empty. Today it is disabled,
and the disabled style is a dashed capsule, so a resting form (Videos, Search,
Write notes, Find singles, the composer) shows its primary action as a broken
outline. Recommended: leave it enabled, and focus the box when pressed empty.
`watch-parties-page.ts` already does not disable it.

### 5. Page header

Four page title sizes across Radio, Video and RSS: RSS 18px, Watch queue 19px, Videos,
Watch and Search video 21px, Singles and Playlists 30px. `app-radio-header` sets
no size, so it inherits the browser's. 141 `<h1>` against 33 `mb-page-header`, plus
10 `app-radio-header`. Give `mb-page-header` a Back slot and a settings slot, and
fold `app-radio-header` into it.

### 6. Rail page

Five pages repeat `290px minmax(0, 1fr)` with the 1000px breakpoint, a sticky
rail and the same explanatory comment: `/rss`, `/videos`, video search, watch
parties, Read. Extract the layout and rail panel. This also fixes
Videos, the only one rendered for this review whose content sits on the page background with no panel.

### 7. Transport and seek

Three answers: icon toolbar (Radio controls, dock), pills (Listen), ten word
pills (profile slideshow). Seek is a labelled form field in two of them, and
`clock()` is written four times with different results (an hour and a half reads 90:00 in Radio controls and 1:30:00 on Listen, Studio and Watch). Extract `mb-transport`, `mb-seek` and one
`clock`. Playback logic stays with each player.

### 8. Choosing one of a few

`MbToolbar` is the accepted answer. Not yet using it: `.seg` in Notifications,
Conversations, Compose, Search and RSS; pill subtabs in Admin accounts; legacy `.tab` or
`.tabs` in 17 app templates (some are routes and want `MbNavigation`); and 34
pressed pills, including Queue, Save, Mark watched and Keep.

### 9. Player consent and reveal

"Load YouTube player", "Allow SoundCloud in Radio", and reveal buttons that say
Show recording, Show video, Show content or Reveal and play are built separately in video player, external player, radio controls, dock, Listen, Watch,
slideshow and StatusCard. One gate, one wording pattern. Privacy-relevant, so
sameness matters more here than looks.

### 10. Labelled menu trigger

`MbPostMenu` can only show •••. Listen therefore shows two identical ••• in one
row (add to playlist, append). `MbPopover` already has a labelled trigger; let
the menu use it: "Add to ▾". `MbActionMenu` still has no app consumer.

### 11. Danger in rows

41 filled danger buttons, mostly in admin, settings and conversation rows. Note
that `.btn-outline.danger` renders **filled**: the danger rule replaces the
outline background. Use compact danger in rows and fill only in confirmations.

### 12. Scales without tokens

Component CSS has 76 font sizes, 37 radii, 98 radius-and-padding pairs on 210
bordered boxes, and 21 gaps on 121 action rows (8px on 63 of them). Four radii
and six sizes would cover most. Do this last and gradually: items 1 to 7 delete
much of it.

### 13. Status lines

81 `<p role="status">` and 67 `<p role="alert">` beside MbNotice, MbContentState
and MbSaveFeedback. Radio and Video use bare paragraphs for errors. Videos'
empty state is one too.

## Videos, specifically

Why it is the left shark, at `/videos`:

- The channel box is a raw input: 21px tall with square corners, beside a 38px
  rounded select. Its label wraps to two lines and the button below it is dashed.
- "Subscriptions" is a heading twice, 50px apart (page `h1`, panel `h2`).
- Each channel takes two or three lines: link, raw checkbox "Include this
  channel", "Channel", an Unsubscribe pill.
- The title shows above the player and again below it.
- Each video has three action strips in four styles: Queue pill, accent link and
  help; a shared-by link; four pills.
- "All videos" is in both the rail and the toolbar.
- Sort is a full-width labelled field with its own band. RSS and Home use a
  compact select in the bar.
- On a phone the whole subscription manager comes before the first video.

Proposed shape, existing pieces only except item row, icons and add box:

```text
rail                              feed
 Subscriptions (?)                 [All | Saved | Shorts]  Newest ▾   ↻ ⚙
 [ Channel link or @handle | + ]   ─────────────────────────────────────
 All videos                        Dishwashers, revisited
 Technology Connections      •••   Tom Scott · 23 Nov · shared by Artist 4
 Kurzgesagt                  •••   [ player                            ]
 Find YouTubers on Mastodon →      ▷ Watch  ＋ Queue  ♡ Save  ✓ Watched  ↩ Respond  ↗ YouTube
```

A channel's ••• holds Channel page, Include in All videos, Unsubscribe. On a
phone the rail collapses to one "Subscriptions (4)" disclosure.

## Defects noticed on the way

| Where                                  | What                                                                                                                                                            |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin/admin-shell/admin-shell.html`   | Eleven tabs do not wrap or scroll. At 1440px the last four run under the right rail; at 390px the page scrolls 607px sideways                                   |
| `reading/radio/find-singles-page.html` | `mb-field density="compact"` around text inputs. Compact is the feed-select variant, so the label sits inline and the row is out of line with every other form  |
| `reading/radio/singles-page.html:57`   | `mbToolbarButton` with `routerLink`: a button acting as a link, so no middle-click or copy link. The toolbar contract says no links; item row should allow them |
| `ui/src/styles.css:291`                | Default links use raw `--accent`: 2.83:1 on white, against the 7:1 text policy. `--ds-action-text` links beside them pass, so pages show two link blues         |
| `audits/adoption-status.json`          | Stale: says 40 widgets, the scanner now finds 49. The scanner also counts localized page copies as separate templates                                           |

The link color is the widest-reaching of these and changes every page. It needs
its own preview and the owner's decision.

## Suggested order

1. **Item row, icons, labelled actions.** Watch queue and Videos adopt them.
   Biggest visible change for the least new surface.
2. **Add box, rail page, page header.** Finishes Videos; evens up Radio and RSS.
3. **Row upgrades with existing widgets.** Write, Search, RSS, collection,
   slideshow, admin rows and the admin tab overflow.
4. **Transport, consent gate, labelled menu.** Listen and the players.
5. **Hold the line.** A `mb/pill-budget` lint rule: three or more pills in one
   group, two or more in a repeated group, or `aria-pressed` on a pill.
   Branch-aware, with today's findings listed individually as a baseline that may
   only shrink. Per finding, not a total, as the README's adoption rule requires.
   Then consider making `variant` required, so loud is a choice.

## Owner decisions (2026-11-24)

1. Default links move to `--ds-action-text` everywhere.
2. The button beside an empty box stays enabled.
3. Page titles are 19px.
4. Repeated rows use icons for familiar verbs, which also helps every language.

## Delivered since this review

Steps 1 and 2 of the suggested order, plus defects:

- Item list, icons, item actions, add box and rail page exist, with specs and
  **Actions / Action rows**. `radio-icon.ts` and `watch-actions.ts` are gone.
- Videos, its subscriptions panel, the watch queue, video search, watch parties and
  the Radio pages adopt them. Rendered pills: Videos 26 to 1, queue 17 to 0.
- Links and accent-colored text use `--ds-action-text`. Left alone: progress fill, file-drop icon,
  Write's unsaved dot, and the photo viewer, which sits on black. Article links on
  reader paper take the article's ink and an underline.
- Admin sections wrap; account status is a toolbar; row dangers are compact.
- Video links under posts (Open Watch, Queue, Open on YouTube) are compact.
- Find singles' fields, Singles' Open button, and the adoption scanner are fixed.

Still open: item 5 outside Radio, Video and RSS, item 6 for RSS and Read, 7 to 10, most
of 8 and 11, 12, 13, and steps 3 to 5.
