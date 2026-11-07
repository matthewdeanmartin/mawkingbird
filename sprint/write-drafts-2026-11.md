# Sprint: Write gap-closing and Drafts (2026-11)

Scope agreed with the owner on 2026-11-07. Everything not listed here lives in
`spec/write-roadmap.md`. English only (no locale pass this sprint).

## Decisions

| Topic               | Decision                                                                                                                                                                                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draft images        | **Parking only.** Browser drafts stay text-only. Parking a single post uploads its images and attaches them to the scheduled post, so the draft keeps them on any device.                                                    |
| Parking threads     | **Refused.** Parking is offered for single posts only; threads stay browser drafts. (Today a thread is silently squashed into one post — that bug goes away.)                                                                |
| Autocomplete        | Skipped this sprint (roadmap).                                                                                                                                                                                               |
| Autosave            | Autosave ~2 s after typing stops, plus the last ~20 versions per draft with "Restore version".                                                                                                                               |
| Shortcuts           | Ctrl/Cmd+Enter opens the publish step (never publishes without confirming), Ctrl/Cmd+S saves the draft, `?` cheat sheet.                                                                                                     |
| Templates           | Not doing.                                                                                                                                                                                                                   |
| Edit scheduled text | Replace on save: create the new scheduled post at the same time, then cancel the old one after one confirmation. If creating fails, the original stays.                                                                      |
| Quote posts         | Quoting opens a dialog: your text box on top, the quoted post shown as a card below it. Next to the Post button, a "Fullscreen edit" button carries text, images and the quote into Write. Write shows and publishes quotes. |

## Work items

### 1. Autosave and version history (`/write`)

- Debounced autosave into the open draft (`drafts.ts` already updates in place).
- Version ring per draft (~20, capped by size) in localStorage; "Restore version"
  list in the draft menu. Restoring is itself saved as a version, so it can be undone.
- Leave guards stay; the unsaved-work prompt only appears when autosave is off or failing.

### 2. Word count and reading time

- Word count + reading time beside the per-post character counts; the zen mode counter too.

### 3. Shortcuts

- Ctrl/Cmd+Enter → publish wizard; Ctrl/Cmd+S → save (prevents the browser dialog);
  `?` outside the textarea, or a menu item, opens the cheat sheet.

### 4. Quote posts

- Status card: Quote opens a dialog (not the inline reply-style box). Text box first,
  quoted-post card below, Post and "Fullscreen edit" buttons.
- "Fullscreen edit" uses the existing composer handoff (`DraftsService.handoff`,
  `drafts.ts:247`) extended with `quotedStatusId`, and navigates to `/write`.
- Write: accepts a quote from the handoff or a saved draft (`DraftSnapshot.quotedStatusId`
  already exists), shows the quoted card, sends `quoted_status_id` on the first post only,
  and offers "Remove quote". Quotes are Mastodon-only in Write for now; Bluesky quotes stay
  in the small composer.
- Explain up front when the author does not allow quotes.

### 5. Scheduling and parking

- **Reschedule**: `PUT /api/v1/scheduled_statuses/:id` with `scheduled_at` (new
  `api.ts` method), in `/drafts` and the schedule workbench.
- **Edit scheduled text**: open in Write tied to the original id; save = create new
  (same time, reusing `media_ids`) → cancel old, with confirmation.
- **Park with images**: upload media, then schedule with `media_ids`.
- **Park refuses threads** with a short explanation.
- **Quota**: show "N of 300 waiting · M on that day of 25" (constants in
  `schedule-plan.ts`), counted from the list we already fetch. Labelled as Mastodon's
  limits, since other server software may differ.
- **Spread parked dates**: today every park made on one day lands on the same date 99
  years out, so the 26th park that day is refused (the 25-per-day limit counts by
  scheduled date). Pick the first far-future day with room.

## Gates

Targeted specs during work, then `cd ui && make test` (log via `ui/scripts/artifacts.mjs`),
`npm run design:inventory-check` (+ audit review if stale), `npm run build:mockingbird`,
and `make design-verify` once at the end if shared widgets changed. Manual live-account
plan: `test_plans/write-drafts-2026-11.md`.
