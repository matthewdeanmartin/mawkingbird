# Contributing

Notes for people changing the Mockingbird UI. Everything here is a rule we
arrived at by getting it wrong first; each section says what the rule is and
what breaking it looked like.

## Style Guide

### Text contrast: no light grey text

**Rule: every piece of text must reach a contrast ratio of 7:1 (WCAG AAA)
against the background it actually sits on.**

Use `var(--muted)` for secondary text. Do not invent a lighter grey, and do not
reach for a hex value because a particular label "isn't important".

Why this rule exists: light grey text means "you may skip this", and text you
may skip should not have been written. In practice the greyed-out thing is a
hint, an explanation, or a warning — exactly the text a reader who is stuck
needs most. It is also the text that disappears first for anyone with less than
perfect eyesight, on a dim screen, or in sunlight. If a string is worth
rendering, it is worth reading.

The old `--muted` was `#657786`. That clears the WCAG **AA** floor of 4.5:1 on
pure white, which is how it survived review — but almost nothing in this app
sits on pure white. On `--bg` (`#f7f9f9`), the page background behind most
panels, the same colour measures **4.38:1**, below AA. "Passes on the colour we
don't use" is how secondary text became unreadable text.

Current values, both AAA against `--col-bg` _and_ `--bg`:

| Theme | Token     | Value     | vs `--col-bg` | vs `--bg` |
| ----- | --------- | --------- | ------------- | --------- |
| Light | `--muted` | `#46535e` | 7.90:1        | 7.47:1    |
| Dark  | `--muted` | `#a8b8c4` | 8.10:1        | 8.87:1    |

If you change a background token, re-check `--muted` against it. Contrast is a
property of the pair, so a lighter panel silently invalidates a colour that was
fine yesterday.

**The two ways this regresses**, both of which have happened:

1. A hardcoded grey in a component stylesheet — `color: #8b98a5` — because the
   token "looked too strong here". Use the token. If the token is genuinely
   wrong for a surface, fix the token or add one, and record the ratio.
2. `opacity` on a text element. `opacity: 0.6` on `var(--muted)` is a light grey
   with extra steps, and it dodges any check that only reads `color`. Reserve
   opacity for genuinely decorative or disabled things, never for live text you
   expect someone to read.

Hierarchy between primary and secondary text comes from **size, weight and
position**, not from fading text toward the background.

### Where a setting lives

Settings pages are cross-listed on purpose. A setting with a real claim on two
categories appears under both — `Privacy` sits under _Basic_ and _People_,
posting defaults appear on both _Writing_ and _Privacy_.

This looks like duplication and is not a mistake. There is no one true partition
of settings into categories, and ours would not match any given user's anyway.
Making someone guess which shelf we filed something under is a worse failure
than showing the same row twice: a duplicated row costs a line of list, while a
mis-filed row costs the user the belief that the setting exists.

When you cross-list, both copies must read and write the same underlying pref,
and each should say where the other one is.

### One save pattern per page

**A settings page either saves everything on change, or saves everything behind
one button. Never both.**

The Privacy page used to do both: server-backed rows sat inside a form with a
"Save changes" button, while the browser-local analytics checkbox applied
instantly. The two kinds of row looked identical and neither said which it was,
so the only way to find out whether your change had stuck was to leave and come
back.

Instant-apply is the default for new work. When you use it:

- Show a transient "Saved ✓" **next to the control that saved**, not in a
  page-level status area. Which thing saved is the whole content of the message.
- Send only the field that changed. Mastodon's `update_credentials` writes every
  key in the `FormData` it receives, so posting the whole form lets a stale value
  from an untouched row overwrite the server's copy.
- **On failure, revert the control and say why, inline.** A control left showing
  a value the server refused is a lie, and on a privacy page it is the dangerous
  direction of lie: believing you are locked when you are public. Name the status
  code when you have one — 401, 403 and a dead network need three different next
  actions from the reader.

### Friction is a feature

The mini composer on Home is off by default, behind a "Quick post" button. The
`thoughtfulPosting` pref goes further and removes the button entirely.

Do not "helpfully" restore a shortcut from an urge to write to a published post.
The distance between those two things is deliberate, and shortening it is the
one change this app is least interested in.
