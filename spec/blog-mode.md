# Blog mode: Mastodon storms as blog posts

Status: **pitch, nothing built.** Revised 2026-11-17 after the owner's first
review, which narrowed the scope. Facts about our code were checked that day.
Items marked **(verify)** come from memory and must be checked before a sprint
relies on them.

## Problem

The app always opens into "scroll the Home feed", and blog features take
digging to find. This is about making long-form writing and reading on
Mastodon discoverable for **many users**, not about one person's workflow.

## Scope (owner, 2026-11-17)

The first draft tried to do too much. Three related but **separate** concepts:

| # | Concept | In this feature? |
| --- | --- | --- |
| 1 | **Mastodon is the blog.** Storms (self-reply threads) and long posts *are* blog posts: writing them, reading friends' storms, and viewing any profile as a blog. | **Yes, the whole feature.** |
| 2 | **Cross-post** a storm to other targets (Mataroa, Hugo, Bluesky, …). | **Yes, as a second-class citizen:** an add-on after a Mastodon post, never the main path. |
| 3 | **Mastodon replies as comments on a static blog** (fediblog). | **No.** Related, different concept; gets its own spec later. |

Dropped from the first draft: the unified posts list across engines, the
`BlogConnector` abstraction, new engines (WordPress, Micropub, …), the Replies
inbox, the hosted fediblog, and the Sites tab.

## What a "blog post" is on Mastodon

Two shapes, one classifier:

- **Storm:** a chain of public/unlisted posts by one author, each replying to
  their own previous post. `readerChain()` (`reading/read/reader-document.ts`)
  already extracts this chain for "Read thread as article".
- **Long post:** a single post over a length threshold. This matters on servers
  with high character limits (Akkoma, GoToSocial, glitch-soc and many
  Mastodon instances with raised limits).

The title is the CW, the first line or the first sentence (open question).
Excerpt, date, reading time and post count come from the chain.

The classifier is pure and shared: web and Native call the same function.
It also closes the "Storms" gap Native Sprint 13 lists.

## Three surfaces

### A. Profile as blog (web and Native)

Any profile gets a **Blog view**: a list of that person's storms and long
posts with title, excerpt, date and reading time. Opening one goes to the
existing `/read` article view, with the replies below as comments.

- **Native:** built from the local archive, so it covers everything collected.
- **Web:** bounded server paging over the account's statuses, keeping roots
  whose author replied to themselves and long single posts. It is honest about
  coverage ("from the last N posts"), in line with the feed-honesty rules.
  **(verify)** whether `exclude_replies=true` keeps self-replies on the account
  statuses endpoint, which decides how cheap the web scan is.
- Your **own** profile's Blog view is "My blog". That is the author's home
  base and the answer to "where are my blog posts".

### B. Roll: friends' storms (Native only)

A reverse-chronological reader of the storms and long posts written by
**people you follow**, from the archive. Selecting a person opens their Blog
view. It reuses Home › Profiles' person-by-person shape, filtered to long-form
writing. It is useless on the web (a live scan finds too few), so it stays
Native-only.

### C. Write, in Blog mode

Write already does threads. In Blog mode it opens set up for a storm:
- title handling
- split preview
- "Publish as storm"
- **Also publish to…**: the cross-post add-on (concept 2)

## Cross-posting (second class)

- Mastodon is always published first and is the source of truth.
- The other targets (the existing Mataroa, Hugo, Bluesky and paste paths) get
  the joined storm text, plus a link back to the storm.
- Each storm keeps a small **publication record**: per target, posted / failed
  / not attempted, with the target URL.
- **Repair** button: retries failed targets, and finishes a storm whose
  Mastodon chain stopped partway (Write already tracks confirmed parts).
- No editing sync: editing the storm doesn't update the copies (v1).

## Discoverability: meeting people in Home

A Blog mode only helps people who switch to it. Since users live in Home, the
feature should also show up there:
- a **Storm** badge on Home cards that start a storm, with "Read as article"
- the author's name on those cards linking to their Blog view
- an empty-state or first-run nudge into Blog mode

## Menu (draft)

```
blog:  Home | Write  Mine  Roll  Drafts  Search | [Fedi ▾]
```

- Roll is hidden on the web, or shows a Native explainer (open question).
- Search means long-form search: archive full-text search on Native,
  hashtag/post search filtered to storms on the web.

## Reused, not rebuilt

| Existing piece | Role here |
| --- | --- |
| `readerChain`, `/read/:id`, Read thread as article | Storm extraction and the reading view |
| Write (threads, preview, wizard, confirmed-parts tracking) | Authoring and partial-failure repair |
| Native archive + Home › Profiles keyset paging | Roll and Native Blog view |
| Mataroa / Hugo / Bluesky / paste publish paths in `WritePublication` | Cross-post targets, unchanged |
| Drafts | Shared and sticky |

Hugo's settings-page posts list, the POSSE queue and fediblog stay where they
are. They belong to concept 3 or are out of scope.

## Sprint sketch (after the questions are answered)

1. **Classifier + profile Blog view (web and Native) + My blog.** Pure
   classifier with fixtures (storms with interleaved replies to others,
   deleted middles, CW titles, long single posts), the Blog view, and opening
   in `/read`.
2. **Blog mode + Write storm setup + Home Storm badge.** `AppMode` `blog`,
   menu, Write preset, discoverability hooks.
3. **Roll (Native).** Archive queries, coverage display, person drill-down.
4. **Cross-post add-on + publication record + Repair.**

## Owner decisions (2026-11-17, second review)

- A blog post is a storm of **3+** posts **or** **over 1250** characters, both
  user-configurable in Settings. A `BLOG:` prefix on the first line marks a
  post as a blog post regardless.
- Interleaved replies: only the author's own chain counts. No threaded tree
  view yet.
- **The CW is never the title. The first line is the title** (minus `BLOG:`).
- Roll = everyone you follow, excluding yourself. It resembles Home › Profiles
  and Algo › Posts; those may move into Blog later (undecided).
- Cross-posting: at publish time, fire and forget.
- How to get from a Mastodon profile to its blog view: **deferred** (the `•••`
  menu is already too big).
- First-time users find Blog through the top-level mode switcher. There is no
  Home badge and no onboarding step for now; the discoverability section
  above is superseded.
- Open to anonymous users, within anonymous API limits.
- Not an SEO surface: search engines are not the audience. **Deep links must work.**

The plan is in `spec/sprint/blog-2026-11.md`.

## Rail widgets (proposals, 2026-11-17)

Ground rules. Rails disappear in zen mode and on phones, so **a rail widget
may only repeat or shortcut something reachable elsewhere**. It is never the
only way in. Each mode chooses from one shared catalogue (`shell/rail-widgets.ts`),
and a page can still fill a rail through `RailOutlet` when what it shows is
about that page.

Already decided for Blog: keep the profile stack, Plus badge, house
ads/endorsements and the server card; hide Just My Server and the hashtag
trends.

### Proposed for Blog mode (ranked)

| # | Widget | Rail | What it shows | Cost | Reachable elsewhere |
| --- | --- | --- | --- | --- | --- |
| 1 | **About the author** | right, on blog and post pages | Avatar, name, bio, follow button, "Profile" | One account read, already loaded | The blog header |
| 2 | **More from this blog** | right, on post pages | The next 3–5 titles from the remembered list | None (memory) | The blog list |
| 3 | **Recently read blogs** | left | The last ~8 blogs opened, newest first; a starter blogroll before Native's Roll | localStorage (`private`, account-scoped) | Browser history; Roll later |
| 4 | **Almost a blog post** | left, Write and Mine | Drafts the verdict says are close ("2 of 3 posts"), with Continue | Local drafts only | Drafts tab |
| 5 | **Post outline** | right, on post pages | One line per part of a long storm (first words), jump links | None | Scrolling |
| 6 | **The rule** | left | "Blog posts: 3+ posts or 1250+ characters, or BLOG:"; Change | None | Settings › Blog |
| 7 | **Your blog at a glance** | left, Mine | Posts this month, latest post date, Write a post | From the list already read | Mine |

Recommendation: 1 and 2 first (cheap, and most useful while reading), then 3
(it bridges the gap until Roll ships, and works on the web). 6 is filler; skip
it unless the rail looks empty.

### The same pattern for other modes (for later)

- **RSS:** unread count per folder; "next unread" shortcut. Hide hashtags and
  Just My Server there too.
- **Video:** Up next (head of the watch queue); live watch parties.
- **Radio:** now playing and the next two in the queue.
- **Forum:** your open questions waiting for answers.

### Questions

1. "Keep badge": I read that as the profile stack (left) **and** the Plus
   badge (right). Right?
2. **Who to follow** (left) and **Bluesky trends** (right) weren't mentioned,
   so Blog still shows them. Hide either?
