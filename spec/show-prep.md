# Show prep: an agent that finds what's cool on Mastodon and cues it up

Status: Sprints 1–2 implemented and uncommitted · 2026-11-26. Runbook:
[ops/podcast_topic_finder.md](../ops/podcast_topic_finder.md). Skill:
`.claude/skills/podcast-topic-finder/SKILL.md`.

## The scenario

The owner records a podcast or screen-share: "What's cool on Mastodon, this week:
Mastodon clients". He needs, before recording:

1. **Gather:** posts, threads, accounts and feeds about the topic, from real
   public Mastodon data.
2. **Vet:** drop or flag anything that should not go on a public stream (people
   who opted out of discovery, content warnings, out-of-context replies, spam).
3. **Cue up:** a run sheet of segments, each a short list of links he can click
   through in Mawkingbird (in screen share mode) while he talks and talks.

Another day the topic is "ESP32 on the fediverse", or "Retro computing". The
topic changes; the pipeline doesn't.

## Why an agent, and why it needs pointers

An LLM agent has no curiosity of its own about a topic. It needs to be told what
to care about: which hashtags and words mark the topic, which people and
servers are the usual sources, what makes a post worth showing, and what must
never be shown. That is a **topic pack** (data), plus **policy** (code, the same
for every topic), plus **taste** (a scoring function the agent and the owner can
tune).

The agent's job is then the part it is good at: running the tools, reading the
candidates, writing one-line "why this is interesting" notes, grouping them into
segments, and asking the owner about anything flagged.

## Design

```
topic pack (JSON)  ─┐
                    ├─► gather ─► vet ─► rank ─► run sheet (Markdown + JSON)
public Mastodon API ┘                              │
                                                   └─► links that open in Mawkingbird
```

- **Topic pack** (`ui/scripts/show-prep/topics/<id>.json`): title, hashtags,
  keywords and the segment each keyword belongs to, servers to read from,
  optional seed accounts, languages, how far back to look, per-author cap.
- **Gather:** public, unauthenticated reads only: hashtag timelines per server
  (`/api/v1/timelines/tag/:tag`), and later thread context
  (`/api/v1/statuses/:id/context`) and account statuses. No sign-in, no writes,
  no scraping of pages. A polite budget (requests per run, small delay).
- **Vet** (pure, tested): every candidate gets `feature`, `review` or `skip`,
  with reasons. Nothing is ever auto-approved for broadcast; `feature` means
  "pre-vetted, still look at it".
- **Rank** (pure, tested): relevance (keyword hits) + engagement (log-scaled) +
  recency, deduplicated by post URI, capped per author.
- **Run sheet:** segments in order, each item with author, server, a short
  excerpt, counts, the original URL, the **Mawkingbird link**
  (`https://mawkingbird.com/<server>/@<acct>/<id>`, which opens the post from
  its home server, signed in or not), and the vetting reasons. Markdown for the
  owner, JSON for the agent.

### Policy (the same for every topic)

| Rule                                                                        | Verdict   | Why                                                                                 |
| --------------------------------------------------------------------------- | --------- | ----------------------------------------------------------------------------------- |
| Post not `public` (unlisted, followers-only, direct)                        | skip      | The author did not publish it to everyone.                                          |
| Author `discoverable: false`, `indexable: false` or `noindex: true`         | skip      | They asked not to be surfaced to strangers.                                         |
| Bio or profile fields carry `#nobot`, `#noindex`, `#nosearch`, `#noarchive` | skip      | Fediverse opt-out conventions; an agent collecting posts is exactly what they mean. |
| A reply to someone else                                                     | skip      | Out of context on a stream; show the thread root instead.                           |
| Older than the pack's window                                                | skip      | "This week" means this week.                                                        |
| Content warning or `sensitive` media                                        | review    | May be fine, but the owner decides before it is on screen.                          |
| Media without alt text                                                      | review    | Accessibility; describe it aloud or skip.                                           |
| Bot account                                                                 | review    | Often fine (release bots), but say so on air.                                       |
| Account younger than 7 days                                                 | review    | Spam and impersonation risk.                                                        |
| Language outside the pack's languages                                       | review    | The owner may not be able to read it out.                                           |
| A boost                                                                     | unwrapped | The boosted post is the candidate; the booster is not credited.                     |

Owner decisions (2026-11-26):

- **No permission round.** The owner will not contact each person. Showing
  public posts in Mawkingbird's **screen share mode** (which keeps private
  accounts and pages off the screen) is the safeguard, together with the
  opt-out rules above.
- **An HTML viewer, not Markdown.** The run sheet is a page in the spec
  library's look (`run-sheet.html`, see below).

- **Images: yes.** Public posts' images go on stream, as in a reaction video.
  The page shows thumbnails (linking to the full image, alt text on hover);
  missing alt text is still flagged, to describe aloud.

**No server blocklist** (owner, 2026-11-26): not relevant now; the opt-out and
vetting rules are enough.

**Seed accounts and trending links: built** (2026-11-26, see "As built:
seeds and trending" below).

### Agent interface

The modules are plain functions with JSON in and out, so the same code serves
three front ends:

1. **CLI** (Sprint 1): `node scripts/show-prep/show-prep.mjs --topic mastodon-clients`
   writes `run-sheet.md` and `run-sheet.json` under `log/show-prep/`. `--json`
   prints the JSON to stdout for an agent driving it from a shell.
2. **Tool calls** (Sprint 2): an MCP server (or Claude tool definitions) exposing
   `gather_topic`, `vet_posts`, `rank_posts`, `fetch_thread`, `build_run_sheet`
   and `explain_policy`, so an agent can iterate ("more about Phanpy", "drop
   that one") without rerunning everything.
3. **In the app** (Sprint 3–4): a "Show" page that loads a run sheet, steps
   through it in screen share mode (next / previous, timer, notes), and opens
   each item in the ordinary reader.

Types are JSDoc on the `.mjs` modules (checkable with `tsc --checkJs`), so the
tool definitions in Sprint 2 can be generated from them.

## Sprints

### Sprint 1: proof of concept (done)

Run it: `cd ui && npm run show-prep -- --topic mastodon-clients --open` (opens
`run-sheet.html`; add `--json` for an agent, or `--fixture <candidates.json>` to
re-rank a saved run offline, `--seed user@host,…` to read accounts for one run, `--app https://mawkingbird.com/canary` to open
links on canary). Tests: `npm run show-prep:test` (18, fixtures
only). Output goes to `log/show-prep/<topic>-<date>/`: `run-sheet.html` (the one
to open), `run-sheet.md`, `run-sheet.json` and the raw `candidates.json`.

**The page** (`run-sheet-html.mjs`) fills the spec library's `template.html`
with its `style.css` inlined, so it opens from disk with no server: segments down
the side, one card per item with **Open in Mawkingbird** and **Original**, a
"Look first" flag on review items, and a **Shown** tick per item (kept in this
browser) with toggles to hide shown or flagged items while recording. Post text
is escaped and only http(s) links are kept.

**First live run (2026-11-26):** 64 public requests (16 hashtags × 4 servers),
2,421 candidates, 773 distinct posts, 22 on the sheet across Web, iPhone and Mac,
Android and Clients in general; no failures. What it taught, and what changed:

- **Ambiguous names.** #Elk brought elk hunting, #Ivory elephant ivory, #Mona
  Gundam fans. Packs now list `ambiguous` names, and a post matched only by one
  must also mention a `contextWords` entry (Mastodon, client, app, …).
- **Article farms.** The same "How to deploy Phanpy" article came from two
  accounts. Identical texts (40+ characters) are kept once, whoever posted them.
- **Raw HTML entities** in excerpts are decoded.
- Keywords match whole words only ("app" is not "happy").
- Scoring: being on topic (8 points) beats any amount of engagement (capped).
- Most of the 773 posts were dropped for age (older than 14 days), replies to
  others and opted-out authors, as intended. A wider window (`maxAgeDays`) is the
  first knob if a sheet comes out thin.

Sprint 1 as planned:

- `ui/scripts/show-prep/`: `topic.mjs` (load and check a pack), `gather.mjs`
  (public hashtag timelines, injectable `fetch`, request budget), `vet.mjs`,
  `rank.mjs`, `run-sheet.mjs`, and the `show-prep.mjs` CLI.
- First topic pack: `topics/mastodon-clients.json`.
- Tests on fixtures, no network: `node --test scripts/show-prep/*.test.mjs`.
- Not in any build or gate: it is an owner tool, run by hand.

### Sprint 2: threads and tool calls (done)

- `session.mjs`: one episode's state (gathered posts, pins, drops, notes, added
  posts), shared by the CLI and the MCP server so they cannot drift.
- `gather.mjs`: `fetchPost` and `fetchThread` (root, post, best direct replies;
  two public requests).
- `mcp-server.mjs`: a local stdio MCP server (`@modelcontextprotocol/sdk` 1.31.0
  and `zod` 4.3.6, both already installed by Angular CLI, now declared as pinned
  dev dependencies). Tools: `list_topics`, `get_topic`, `explain_policy`,
  `gather_topic`, `shortlist`, `fetch_thread`, `add_post`, `pin`, `drop`,
  `restore`, `add_note`, `status`, `build_run_sheet`; prompt `produce_episode`.
  Declared in the repo's `.mcp.json`.
- The page shows pinned items first and each item's speaker note.
- Tests: an MCP client drives a whole episode over an in-memory transport
  against a fake fediverse (21 tests in all).
- Seed accounts and trending links followed the same day (below).

### As built: seeds and trending (2026-11-26)

- **Seed accounts** (`seedAccounts` in the pack, `--seed a@b,c@d` for one run,
  or the agent's `suggest_seeds` → owner's yes → `add_seeds`): each account's
  recent posts, no replies or boosts; two public requests each. A seed post must
  name something specific (a segment keyword other than the catch-all's, or one
  of the pack's hashtags, ignoring URLs), then gets a small ranking lift.
  `suggest_seeds` ranks the gather's authors by on-topic posts; it never edits
  the pack.
- **Trending links**: each server's `/api/v1/trends/links`, kept only when the
  article names one of the pack's hashtags, or has a segment keyword and says
  Mastodon/fediverse/ActivityPub. Then the posts about it (`/timelines/link`,
  Mastodon 4.3+). On the sheet: a "Trending on Mastodon" section of link cards
  (headline, image, shares, top posts, **Posts about it in Mawkingbird** →
  `/link?url=`, **Open the article**). Saved runs keep `links.json`; links are
  re-checked against the current rules when read.
- **Strong language** is now a "review" flag.
- First live run with both (2026-11-26, seeds `apps@toot.fedilab.app` and
  `fantinel@hachyderm.io` for that run only): 74 requests. The first link rule
  let in Nextcloud's desktop app and an Android developer-address story, and the
  first seed rule a joke and an unrelated app; both rules were tightened, with
  those cases as tests. Under the final rules: 0 trending links (honestly none
  that week), 2 seed posts on the sheet (the iPhanpy release, Fedilab's Nitter fix).

Original plan for this sprint:

The MCP server is optional, and only worth building if the owner wants a
conversational producer: an agent calling `gather_topic`, `fetch_thread`,
`vet_posts`, `build_run_sheet` one at a time ("dig into that thread", "drop the
German posts", "find two more about Phanpy") instead of a one-shot command. The
run sheet and its page work without it.

- Gather thread roots and their best replies (`/context`), seed accounts'
  recent posts, and the server's trending links for the topic.
- An MCP server over the same functions, plus an agent prompt ("you are the
  producer for this episode") that tells the agent what to care about, step by
  step, and when to ask the owner.
- Agent-written segment notes ("why this matters", 1–2 sentences, never
  quoting more than the post itself).

### Sprint 3: the Show page in Mawkingbird

- `/show?sheet=…`: loads a run sheet (pasted, file or URL), walks it item by
  item in screen share mode with keyboard next/previous, a per-segment timer and
  speaker notes that stay off the shared screen.
- "Open in reader" uses the ordinary thread and profile pages.

### Sprint 4: second topic and polish

- A second pack ("ESP32 on the fediverse") to prove packs are the only thing that
  changes.

## Not in scope

- Posting, boosting, following or DMing on the owner's behalf.
- Any private data: no sign-in, no home timeline, no notifications.
- Judging content for harassment or hate automatically. The policy table above
  is mechanical; anything subtle is the owner's call on review.
