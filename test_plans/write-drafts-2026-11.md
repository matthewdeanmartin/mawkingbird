# Write and Drafts sprint (2026-11)

Covers `sprint/write-drafts-2026-11.md`. Sections are added as each work item
lands; untested sections say so.

**Build:** local production build or `/test/` staging after the sprint commit.
**You need:** Mastodon M (a 4.5+ server, for quotes), and two browser tabs.

## 1. Autosave and version history

- [ ] Start a new draft in Write, type a sentence, stop for 3 seconds. The draft
      appears in the drafts list with no "Saved." banner, and the header shows
      "saved just now".
- [ ] Reload the tab mid-sentence (within 2 seconds of typing). No browser
      "leave site?" prompt; the text is in the draft after reload.
- [ ] Switch to another draft right after typing. No "unsaved work" dialog; both
      drafts keep their text.
- [ ] Open the same draft in two tabs. Edit in tab A, wait 3 seconds, then edit
      in tab B. Tab B shows "Autosave paused: this draft was changed in another
      tab". Tab A's text is not overwritten. Save draft in tab B keeps both.
- [ ] Edit a draft over more than 5 minutes, with a Save draft in between.
      Versions lists several entries, newest first, with word counts.
- [ ] Restore an older version. The editor shows it, the banner names its time,
      and Versions now lists both the restored text and the text you had before.
- [ ] Delete the draft from /drafts. Its versions are gone (create a new draft
      and check that Versions does not show the old text).
- [ ] With an image attached, leaving the page still asks first (images are not
      kept in browser drafts).

## 2. Word count and reading time

- [ ] The preview bar shows words next to the post count; a thread's `---` lines
      are not counted. Text over ~350 words also shows "N min read".
- [ ] Zen mode shows the word count.

## 3. Shortcuts

- [ ] Ctrl+S (Cmd+S on a Mac) in Write saves the draft; the browser's "Save page"
      dialog does not open.
- [ ] Ctrl+Enter opens the publish step and nothing is sent until you confirm.
- [ ] With the Versions dialog or the publish step open, Ctrl+Enter does nothing.
- [ ] Pressing `?` outside a text box shows the shortcut sheet with a
      "Write page" group.

## 4. Quote posts

Not built yet.

## 5. Scheduling and parking

Not built yet.

## Findings

_None yet._
