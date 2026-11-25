# Action rows

What to do when a row of buttons keeps growing. [Button weights](components.md#button-weights)
covers one button; this covers the second, third and fourth.

## How it happens

A feature needs a trigger, so it gets a pill. The next feature adds another
beside it. Each is reasonable alone. Nobody decides to build a row of six
identical capsules, so nobody decides to stop.

A row of pills also hides what its members are. Save, Watched, Watch Party and
Post Response look the same on Videos, but two are toggles, one is a link and
one opens a composer. **Most pill rows are several kinds of control dressed
alike.** Sort them by kind and the row usually dissolves.

## The budget

| Place                                                  | Pills allowed                                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| A page header, panel, form or dialog footer            | One `solid`, at most two `outline`                                                   |
| Anything repeated: a list row, a card in a feed        | None                                                                                 |
| A repeated card that exists for one verb (Add, Follow) | One                                                                                  |
| A toggle, filter, sort or view switch                  | None, anywhere. A pressed pill is filled, so it looks like the primary action        |
| A destructive action                                   | None outside its confirmation dialog, unless the page exists for it (Delete account) |

Multiply a repeated row by its rows before judging it. Four pills on a queue
row is eighty pills on a twenty-video queue.

Two tests catch what counting misses:

- **The phone test.** At 390px the row stays on one line in English, with about
  a third to spare for German. If it wraps, it is over budget at any count.
- **The squint test.** Blur the screen. You should still see one primary action.

Adding a pill to a row already at its budget means upgrading the row, in the
same change. That is the whole rule.

## Step 1: sort by kind

| Ask of each control                           | It is a         | Use                                                                                                          |
| --------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------ |
| Does the URL change?                          | Destination     | `MbNavigation` if there are several; a `link` button or content link if one                                  |
| Is exactly one of these chosen at a time?     | Choice          | `MbToolbar` with `pressed`; compact select above five options; `MbRadioGroup` in a form; `MbTabs` for panels |
| Is it on or off, and does it stay so?         | Toggle          | `pressed` on a toolbar button or post action. A setting goes in the page's Customize dialog or Settings      |
| Does it act on this one item?                 | Item command    | Icon toolbar or labelled post actions, below                                                                 |
| Does it act on everything here?               | Page command    | The header toolbar. Not repeated in rows                                                                     |
| Does it move an item up or down?              | Reorder         | An ↑ ↓ icon pair in the row's toolbar                                                                        |
| Does it drive playback?                       | Transport       | An icon toolbar, play first among equals                                                                     |
| Does it destroy something?                    | Danger          | Last and quiet (`compact` danger, or the last menu row), then a confirmation with the one solid red pill     |
| Does it submit a box beside it?               | Part of a field | `mbAddBox`: attached to the input, outside the row                                                           |
| Is the label a value (a tag, person, engine)? | Data            | Rows or links, never buttons                                                                                 |
| What remains                                  | Command         | The budget above                                                                                             |

## Step 2: pick the pattern

Take the first that fits.

1. **One thing to do here.** One `solid`.
2. **A primary and an alternative.** `solid` plus `outline`. Add a `link` for
   "Not now", "Skip" or Back.
3. **Three or more, all familiar, repeated per row.** Icon toolbar in an
   `mbItemRow`: `mb-toolbar density="compact" embedded` with `mb-icon`s. Play,
   share, edit, ↑, ↓, remove read without words, in every language. Every icon
   button has an `aria-label` and a `title`. The title is the link that opens the
   thing. Reference: a playlist's tracks, the watch queue.
4. **Three or more, and some need words.** Labelled actions: `mb-item-actions`,
   icon and word, no box. It wraps quietly and takes links and buttons together;
   `iconsWhenNarrow` keeps a feed's rows to one line on a phone. Reference: the
   row under the Watch player and each video in Videos. This is the default for
   cards. Reach for it before a menu.
5. **View, filter or mode controls.** Compact toolbar in groups: which items,
   then how shown, then page actions. One toolbar, not stacked bars.
   Reference: the top of Videos.
6. **Several of the same verb** ("Add to Queue", "Add to Friday mix", "Append to
   …"). One labelled menu, "Add to ▾". Not one control per target, and not two
   bare ••• in one row, which nobody can tell apart.
7. **Rare or destructive leftovers.** A single ••• at the end.
8. **More than about seven after all that.** It is a page or a panel. Give the
   controls headings, or ask which ones nobody would miss.

A menu is late in this list on purpose. Frequent actions stay visible; the fix
for a loud row is a quieter weight, not an extra click. Never hide an action
just to make a row fit.

## Row rules

- Order: primary, then frequent, then rare, then danger. Same order in every row
  of a list, including rows where one is disabled.
- Navigation goes on the item's title or picture. If the title already opens the
  thing, the row does not need Open or Watch.
- One action, one place. Not in the header, the row and the empty state at once.
- Do not mix weights of the same rank: no pill, accent link and bold link side by
  side as equals.
- A state word is not a button. "Subscribed" that also unsubscribes needs
  `pressed` and a name saying what pressing does.
- Keep labels to one or two words. A third word is a hint: use `title` or `mb-help`.
- Avoid full-width pills outside narrow forms and phones.
- Spacing belongs to the group. Use the shared group's gap rather than a new one.

## Worked examples

Line numbers are from 2026-11-24, before any change. **Done:** all but
Listen. Write keeps its own local tabs; Search keeps Saved as an outline menu.

| Today                                                                                                                  | What they are                                      | Instead                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `reading/videos/watch-queue-page.ts:76`: Watch, Move up, Move down, Remove, as pills on every row                      | Destination, reorder, danger                       | Title opens Watch; icon toolbar ↑ ↓ 🗑, as a playlist does. 17 pills on a four-video queue became none                                    |
| `reading/videos/videos-page.html:195`: Save, Mark watched, Watch Party, Post Response; Queue and Open on YouTube above | Two toggles, two destinations, a toggle, a command | One labelled action row per video. Five pills per video become none                                                                      |
| `publishing/write/write-page.html:100`: Board, Drafts, Notes, All drafts, Pastes, Links                                | Two pane toggles, a panel, three destinations      | Destinations join the Editor / Notes tabs; pane toggles become a compact toolbar; All drafts and Manage open the same page, so keep one  |
| `discovery/search/search.html:24`: Search, 🤖, Syntax, Advanced, Saved, Save, Share                                    | Submit, two helps, a mode, a menu, two commands    | Search stays attached to the box. Advanced is a pressed toolbar button. Saved ▾ holds Save. Syntax becomes `mb-help`. Share is `compact` |
| `admin/accounts/admin-accounts.html:27`: four solid red pills per person                                               | Danger                                             | Compact danger words, or ••• holding Suspend, Disable, Delete. Red fill only in the confirmation. As it is, nothing looks dangerous      |
| `accounts/profile/profile-slideshow.html:1`: ten outline pills                                                         | Transport, a stepper, three commands               | Icon toolbar ⏮ ▶/⏸ ⏭ with fullscreen and close; speed as a compact select, as in the video player; Copy link `compact`                   |
| `discovery/collection/collection.html:48`: up to six                                                                   | One primary, owner commands, danger, report        | Follow everyone `solid`; Edit and Add people `compact`; Delete, Remove me and Report under •••                                           |
| `reading/radio/listen-page.html:139`: three pills and two bare •••                                                     | Item commands, and one verb with many targets      | Labelled actions, with a single "Add to ▾" for queue, Singles and playlists                                                              |
| `reading/rss/rss-page.html:9`: two solid and one outline, wrapped                                                      | Command, view switch, command                      | Paste a link `solid`; the kits switch `compact` pressed; Friends' blogs a rail row                                                       |

## When pills are right

Onboarding, sign-in, empty states, dialog footers, a wizard's Next, and a
landing page's call to action: a reader with one decision to make, seen once. A
row that fits its budget does not need upgrading. Fewer shapes is not the goal;
a visible primary action is.

## Review checklist

1. Did this change add a pill? Count the row, and multiply if it repeats.
2. Are all the row's members the same kind of control?
3. Is anything pressed, filtering or navigating in a pill?
4. Is there more than one filled button in view, or any red one outside a dialog?
5. Does it hold one line at 390px?
6. Does another page already solve this row? Radio usually does.
