# Write roadmap

What comes after `sprint/write-drafts-2026-11.md`. Items are roughly in priority
order within each section. Facts were checked against the code on 2026-11-07.

## Scheduling

- **Scheduled threads as a Mawkingbird Plus feature.** Mastodon cannot schedule a reply
  to a post that does not exist yet, so a whole thread cannot be scheduled with the
  client alone. A Plus server-side scheduler would hold the thread and post each part as
  a reply when its time comes. It needs a token with posting scope held server-side, so
  it needs its own security review, consent copy and a way to revoke access. A free
  fallback could post the rest of the thread the next time the app is open after the
  first post goes live, with a clear warning.
- Calendar/queue view in the schedule workbench, with the time zone shown, and a
  "Schedule…" link from Write.
- Scheduling for other destinations (Bluesky has no server-side scheduling; it would
  also need Plus).

## Drafts

- Images in browser drafts (IndexedDB blobs keyed by draft id) — deferred by choice;
  parking covers cross-device images for single posts.
- Parking threads (each part as its own scheduled post, or one restorable post) —
  refused for now.
- Draft export/import as `.md` with front-matter (CW, language, visibility, schedule).

## Editor

- Autocomplete: `@mentions` first (most typo-prone), then `#tags`, then `:emoji:`.
- Ctrl+Shift+Enter to insert a thread split.
- Optional length goal ("1,000 words") for blog destinations.

## Code fences

- Render ` ```lang ` blocks as code in the preview and the timeline. Today any
  fence turns off all markdown for the post (`markdown.ts`).
- Syntax highlighting, loaded lazily only for posts that contain a fence (keep it out of
  the initial bundle), with a copy button and language label.
- "Post as Markdown" on servers that accept `content_type: text/markdown`
  (glitch-soc, Akkoma/Pleroma, GoToSocial).
- "Open in…" links that put the code in the URL fragment: Python Tutor, TypeScript
  Playground, Compiler Explorer, Rust Playground. CodePen/JSFiddle need a POST form,
  which our CSP (`form-action 'self'`) blocks.
- "Move code to a paste/Gist" on a fence in Write.
- **Running code (later, optional).** Needs a runner page on a separate registrable
  domain (not a subdomain), framed with `sandbox="allow-scripts"` and fed by
  `postMessage`. A `srcdoc`/`blob:` frame inherits our `script-src 'self'` CSP, and a
  Web Worker on our origin could reach our storage. No `/ide/` page is needed.

## Pastes and link shorteners (secondary workflow)

- When a post is far over the limit, offer "post the opening and put the full text in a paste".
- Optional "shorten links when publishing" setting.
- Opt-in, click-to-load "Show text" previews for Rentry, Gist and `/message/` links.
- Click counts on `/links` for providers that report them (Dub, Short.io, Rebrandly, T.LY).
- Show a short link's destination before clicking, where the provider has a preview
  lookup; never follow redirects through the proxy.
- Open paste history entries back in Write for editing.
