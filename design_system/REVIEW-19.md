# Sprint 19 review: post ••• menu (checkpoint A)

[Open Sprint 19](http://127.0.0.1:6006/?path=/story/start-here-sprint-19-review--post-menu)
(`cd ui && npm run design:dev`).

Preview only. The app's StatusCard still uses its legacy `<details>` menus;
nothing migrates until this preview is reviewed. See the
[sprint plan](sprints/19-post-menu.md) and [opening audit](audits/19-post-menu.md).

The sample post reproduces StatusCard's ••• menu with shared widgets: tag-mute
rows, private like, save as to-do, the two open-original links, mute post,
timed author mute, block and report. Actions write to the on-page log; nothing
is posted, muted or stored.

## Try it

- Open **•••**. Tap outside, press Escape, or use **Close menu**: each closes
  it, and Escape and Close return focus to •••. The post behind the menu never
  opens.
- **Private like** and **Mute a hashtag (7)** stay open and change state in
  place. Every command (Save as to-do, a duration, Block, Report, a hashtag)
  closes the menu first, then acts.
- Switch **Own post** and **No server actions**: own posts have no mute, block
  or report rows; providers without server actions have no report.
- Turn on **7 hashtags**. One row reveals an indented list that scrolls inside
  its own box. Four or fewer tags keep a row each.
- Scroll to **Post near the bottom of the screen** and open its menu: it opens
  upward. On a short window it shortens and scrolls inside the panel rather
  than covering the •••.
- Try dark mode, narrow width and RTL. The menu stays on screen with no
  horizontal page scroll.

## Decisions to review

1. **Popover, not a bottom sheet, on phones.** The panel stays beside its •••
   at every width. The 2026-10-13 legacy phone sheet is not carried forward.
2. **Mixed content keeps dialog semantics.** Rows are native buttons and links
   in Tab order, with no `menu`/`menuitem` roles and no arrow-key roving
   (Sprint 16 decision). ActionMenu stays for pure command lists.
3. **Close menu is built in** and always last, after a separator.
4. **Danger tone is explicit.** The legacy panel made every button red by
   default; here only Mute post, Block and Report are red. To-do, durations and
   Unmute are neutral.
5. **Mute durations are inline choices** in a captioned group: compact rounded
   chips with 44px touch targets.
6. **The panel moves when it grows.** Expanding the hashtag list can move the
   menu from below the ••• to above it if that side has more room.

Known preview artifact: untranslated English inside an RTL page reorders
("days 7"). That is ordinary bidi for English text in an RTL page; translated
RTL labels are unaffected, and the legacy chips behave the same.

## Verification

- 8 new unit cases (`design-system/menu/menu.spec.ts`): trigger naming and
  state, first-row focus, Close row and focus return, close-vs-stay rules, card
  click/key isolation, tone/inline/group naming, and list placement (below,
  above, capped beside the trigger).
- 9 new catalogue browser checks (`tests/review-19.browser.mjs`): keyboard
  entry, Tab, Escape, outside dismissal, Close, toggles, commands, native links,
  variants, the 7-tag list, and geometry at 1280 light, 375 dark, 320 RTL and a
  375×420 short screen. Screenshots are under
  `test-results/review-19.browser.mjs-*/`.
- Gates, 2026-10-13: design static (inventory 230/230 dispositions, 41 rule
  checks, formatting, Storybook types and build); all 399 catalogue browser
  checks; Angular lint; full `make test` with 7,933 tests and 0 missing
  inventory entries; production build at 924.24 kB initial, unchanged.

No screen-reader or real-device testing is claimed. The working tree is
uncommitted and not deployed.

## After approval (checkpoint B)

Replace StatusCard's three panels, PrivateLikeButton's and TagMuteMenu's copied
row styles, and the legacy `.danger-menu*` CSS. The plan lists the open risks:
dialogs opened from the menu, close-on-resize on mobile, and spec selectors.
