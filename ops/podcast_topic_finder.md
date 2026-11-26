# Podcast topic finder ("What's cool on Mastodon")

Finds what is worth showing on a topic, vets it, and cues it up as a run sheet
you click through on video in Mawkingbird. Design and rules:
[spec/show-prep.md](../spec/show-prep.md). Code: `ui/scripts/show-prep/`.

It only reads public posts from public Mastodon APIs, signed out. It never posts,
boosts, follows or messages anyone. Output goes to `log/show-prep/` (ignored by
git).

## Two ways to run it

|                   | When                                                                           | How                                                                            |
| ----------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| **One command**   | You just want a sheet                                                          | `cd ui && npm run show-prep -- --topic mastodon-clients --open`                |
| **With an agent** | You want to steer: "dig into that thread", "drop the German ones", "add notes" | Claude Code in this repo, MCP server `show-prep`, skill `podcast-topic-finder` |

Both write the same files and use the same rules.

## Before an episode

1. Pick or write a topic pack (see [New topic](#new-topic)). Today:
   `mastodon-clients`.
2. Decide where links should open: production (`https://mawkingbird.com`, the
   default) or canary (`--app https://mawkingbird.com/canary`, or `app` in the
   agent's `build_run_sheet`).

### One command

```bash
cd ui
npm run show-prep -- --topic mastodon-clients --open
```

About a minute: 64 public requests for the current pack. The page opens in your
browser. Files: `log/show-prep/<topic>-<date>/`:

- `run-sheet.html`: the page to use on air;
- `run-sheet.md`, `run-sheet.json`: the same sheet as text and data;
- `candidates.json` and `links.json`: everything gathered, to re-rank without the network:
  `npm run show-prep -- --topic mastodon-clients --fixture ../log/show-prep/<dir>/candidates.json --open`.

### With an agent (Claude Code)

The repo's `.mcp.json` declares the `show-prep` server; Claude Code asks once
whether to use it. Outside this repo, register it yourself:

```bash
claude mcp add show-prep -- node ui/scripts/show-prep/mcp-server.mjs
```

Then ask, for example:

> Produce tonight's Mastodon clients episode. Links on canary.

The `podcast-topic-finder` skill (`.claude/skills/podcast-topic-finder/SKILL.md`)
tells the agent what to care about. It gathers, shortlists per segment, reads
threads, pins 3–5 items per segment with a one-line note each, asks you about
flagged items, and builds the sheet. The `produce_episode` prompt carries the
same instructions for clients that use prompts.

Useful things to say while it works: "show me the Android shortlist", "dig into
the Ivory thread", "drop that one, covered last week", "move it to General",
"add this post: <link>", "rebuild".

## Seed accounts and trending links

- **Seed accounts** are people and projects whose recent posts are read even
  without a hashtag (release posts often have none). Add `user@host` handles to
  the pack's `seedAccounts`, or try some for one run with
  `--seed apps@toot.fedilab.app,…`. With the agent: it calls `suggest_seeds`,
  shows you candidates from the gather, and reads only the ones you approve.
  A seed's off-topic posts (cat photos, other projects) stay out.
- **Trending links** are articles and videos many people on the pack's servers
  are sharing right now. Only ones that name a project from the pack, or are
  about the fediverse and a segment's subject, are kept; most weeks that is
  zero to three. They open the sheet as "Trending on Mastodon", with
  **Posts about it in Mawkingbird** (who is talking about it) and
  **Open the article**.

## On air

- Open `run-sheet.html`. Segments are down the side; each card has
  **Open in Mawkingbird**, **Original**, a **Shown** tick and any speaker note.
- Turn on Mawkingbird's **screen share mode** before sharing the screen.
- **Hide shown** and **Hide flagged** at the top keep the page short as you go.
- Yellow "Look first" cards are flagged: content warning, image without alt
  text (describe it aloud), bot, brand-new account, or another language.

## New topic

Copy `ui/scripts/show-prep/topics/mastodon-clients.json` to `<id>.json` and edit:

| Field                          | What it does                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `id`, `title`, `blurb`         | Names the episode; the blurb tells the agent what to care about.                                         |
| `servers`                      | Big public servers to read hashtags on (bare host names).                                                |
| `hashtags`                     | Without `#`. Every tag × server is one request.                                                          |
| `segments`                     | `{ id, title, keywords }`, in running order; the last one is the catch-all. Keywords match whole words.  |
| `ambiguous`, `contextWords`    | Names that are also ordinary words (#Elk, #Ivory): a post matched only by one also needs a context word. |
| `seedAccounts`                 | Reserved; not read yet.                                                                                  |
| `languages`                    | Others are flagged, not dropped.                                                                         |
| `maxAgeDays`                   | The window ("this week" → 7).                                                                            |
| `perAuthor`, `perSegment`      | Caps. Pinned items are never cut.                                                                        |
| `perTagLimit`, `requestBudget` | Posts per request (max 40) and the run's request ceiling.                                                |

Then `npm run show-prep:test` (a broken pack fails "every shipped topic pack is
valid") and one run. An agent can draft the pack too: the skill says how.

## When something is off

| Symptom                            | Likely cause                                                                  | Do                                           |
| ---------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------- |
| Few items on the sheet             | Window too short, or few posts this week                                      | Raise `maxAgeDays`, add hashtags or servers. |
| Off-topic items                    | A hashtag that is an ordinary word                                            | Add it to `ambiguous`.                       |
| No trending links                  | Nothing on topic is trending this week                                        | Normal; the rest of the sheet is unaffected. |
| "HTTP 401/403" in "Could not read" | That server keeps its hashtag timelines private                               | Drop it from `servers`.                      |
| "budget … reached"                 | More tags × servers than `requestBudget`                                      | Raise the budget or trim tags.               |
| A link opens on Home, not the post | An old sheet built before 2026-11-26, or a deploy without the bare-handle fix | Rebuild the sheet; deploy.                   |
| The agent doesn't see the tools    | MCP server not approved or not registered                                     | `claude mcp list`; approve `show-prep`.      |

## Checks

`cd ui && npm run show-prep:test`: fixtures only, no network (pipeline, vetting,
page escaping, and the MCP server end to end through a real client). Not part
of any build or GitHub gate: it is an owner tool.
