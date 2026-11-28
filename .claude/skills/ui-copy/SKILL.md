---
name: ui-copy
description: Rules for any text or control a Mawkingbird user sees. Use before adding or editing a `// i18n` string, button, label, hint, empty state, warning, settings or feature-flag description, menu row, or a group of buttons or tabs.
---

# UI copy and controls

Every string answers one question: **what does this do for me, right now?**
Say that in as few words as possible, then stop. Everything else goes in a code
comment, `spec/`, or a help page in `docs/` linked from the screen.

## Cut on sight

- **Explaining internals:** how it's computed, sampled, cached or fetched.
- **Developer reasoning:** why it was built this way, what the API lacks, what it used
  to do. Users never saw the old version.
- **Arguing with the user:** "…but it's your list, so set it where you want."
- **Fear text:** warnings and reassurances that don't change what the user does.
  Write guards in code, not worry in the UI. Keep a disclosure only when it changes a
  decision, as one plain sentence.
- **"A, not B":** say it once, positively. Keep B only if it's a mistake users make.
- **"Nothing is changed":** only right before an action that commits something.
- **Eyebrow text:** a small label above a heading that repeats it.
- **Developer words:** localStorage, endpoint, OAuth flow, REST. Say "saved in this
  browser". "API key" and "API calls" are fine.
- **Marketing inside settings.**
- **Paragraphs.** More than one sentence in a dialog belongs on a help page.

House rules: "Twitter", never "X". Feature-flag labels and descriptions are user copy
too.

## Controls

- **Three or more capsule or pill buttons side by side is almost always wrong.**
  - Sections of a page: an underline tab strip (`mb-tabs`, or `mbNavigation
    presentation="tabs"` when each section is a route).
  - Filters or actions inside a section: `mb-toolbar` with `mbToolbarButton
    [pressed]`.
  - Many options: a `select` or a menu.
  - A rarely used action: no button. Put it in a menu or a settings page.
- Don't give every action its own button. Ask which one or two most users need.
- **The `…` menu is locked** (`shell.spec.ts` asserts its rows). A new feature's door
  goes in `shell/even-more/even-more-links.ts`, gated so it never shows a link that
  can only fail. No nested menus.
- Add new paths to a feature beside the old ones. Don't remove the old path.

## After editing

Run `npm run i18n:extract`, then `npm run check:i18n`. Grep specs for any phrase you
changed (`grep -rF "<old words>" ui/src --include=*.spec.ts`). For a cleanup pass
through existing copy, use `ops/COPYEDIT_RUNBOOK.md`.
