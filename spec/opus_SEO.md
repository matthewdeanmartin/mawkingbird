# SEO plan (Opus review, 2026-11-12)

Status: proposal, nothing implemented. Owner decisions are marked **Decide**.
Engineering reference: [ui/docs/seo.md](../ui/docs/seo.md). This plan does not
repeat what that file already describes.

## Bottom line

The on-page engineering is unusually good for a site this young. That includes
prerendering, canonicals, hreflang, sitemaps with real `lastmod`, breadcrumbs,
nofollow on app links and build-time SEO checks. The gaps are mostly off the
page:

1. **Host configuration leaks** (checked live today): HTTP is served, not
   redirected, and the old github.io origin redirects _to HTTP_. Fix this first.
   It takes minutes.
2. **Shared post and profile links are HTTP 404s titled "Loading…".** Every
   share of a Mawkingbird link currently unfurls as nothing. The unfinished
   share work matters for distribution, not indexing. Finish it with a
   Cloudflare Worker, not more SPA routes.
3. **Authority, not pages, is the bottleneck.** The site is about two months
   old, with 477 sitemap URLs (about 380 of them tool translations) and almost
   no inbound links. Partial indexing is the expected result. More pages will
   not fix it. Links and demand will.
4. **No per-section measurement.** You can't tell which page families Google
   accepts. Split the sitemap and set up a weekly check before building more.
5. **AI answer engines are partly shut out** by Cloudflare's managed robots.txt.
   That might be what you want, but nobody chose it in this repository.

## 1. Verified live findings (curl, 2026-11-12)

| Check                                        | Result                                                                 | Severity |
| -------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| `http://mawkingbird.com/tools/`              | **200**, no redirect to HTTPS, no HSTS header                          | High     |
| `matthewdeanmartin.github.io/mawkingbird/`   | 301 → **`http://`**mawkingbird.com/ (then 200 on HTTP)                 | High     |
| `matthewdeanmartin.github.io/mastodon_mock/` | 200, title "Mawkingbird", no canonical, no noindex                     | Medium   |
| `/@Gargron@mastodon.social`, post deep link  | **404**, `<title>Loading…</title>`, no OG tags                         | High     |
| `robots.txt`                                 | Cloudflare-managed block prepended (see §5)                            | Decide   |
| `og:image` on every public page              | Same `mockingbird_hand.png`: 778 KB, 3580×2508 (1.43:1, not 1.91:1)    | Medium   |
| `fediverse:creator`                          | Only on `/news/`. Missing on tools, communities, features              | Low      |
| JSON-LD                                      | On `/features/` and topic pages. None on `/tools/` or individual tools | Low      |
| `www.` and trailing-slash redirects          | Correct (301)                                                          | OK       |

### Fixes (owner, Cloudflare and GitHub dashboards, no code)

- Cloudflare → SSL/TLS → Edge Certificates: turn on **Always Use HTTPS**, then
  **HSTS** (start with `max-age` of 1 month, no preload; raise it later).
- Old github.io origin: GitHub Pages redirects a project site to its custom
  domain using whatever scheme Pages thinks the site has. Once Cloudflare
  forces HTTPS the extra hop is harmless, but check that the chain ends at
  `https://mawkingbird.com/` in at most two hops.
- `mastodon_mock` Pages site: it competes for the brand query "Mawkingbird".
  **Decide**: retire its Pages site, or add one `<meta name="robots"
content="noindex">` (or a canonical to mawkingbird.com) to its published
  index. That is a deployment edit, not a code sync, so it doesn't break the
  frozen-fork rule.
- Google Search Console: add a **Domain property** (DNS TXT) if you only have a
  URL-prefix property. It covers http/https/www and shows the duplicate-host
  problem going away.

## 2. Grading what's already done

### Tool landing pages (about 22 tools, 17 languages, about 380 URLs): B+

Good: one task per page, real copy, Questions sections, sign-in that returns to
the page, signed-out bodies for search, handles and images.

Improve:

- **Translation scale vs. authority.** About 360 translated URLs on a
  two-month-old domain probably make up most of "Discovered/Crawled – currently
  not indexed". That isn't a penalty, but Google rations crawling and indexing
  by trust. Don't add languages until measurement (§4) shows indexing and
  impressions for the existing ones. **Decide** a rule, for example: after 10
  weeks, a language with no impressions on any tool page gets one review. Keep
  it if the copy is native-quality, and consider `noindex` if its tool body is
  mostly English fallback (Vietnamese, Swedish and Hindi are preview locales).
  A page whose interactive part falls back to English is the weakest kind of
  translated page.
- **Per-tool structured data.** Add a `WebApplication` (or `SoftwareApplication`
  with `applicationCategory: SocialNetworkingApplication`, `offers.price: 0`) to
  each tool page, plus a `BreadcrumbList` (Mawkingbird › Tools › tool). Skip
  `FAQPage` and `HowTo`. Google no longer shows those rich results for sites
  like this, so they aren't worth the check surface.
- **Per-page OG images.** Every share of every page shows the same hand-drawn
  bird. Generate a 1200×630 card per tool and per topic page at build time
  (title plus icon on a brand background; satori/resvg in a Node script,
  outside the bundle). It helps click-through on Mastodon, Bluesky, Slack and
  Discord, and it's the cheapest CTR gain available. Also ship a 1200×630,
  under 200 KB version of the bird for the default card.
- **`fediverse:creator`** on every public page (`@mawkingbird@mastodon.social`).
  Mastodon then shows "More from Mawkingbird" under every link preview, and a
  follow there is a returning visitor.
- **Titles as queries.** Check each English title against the query people
  actually type (GSC → Queries once data exists). Example: "Mastodon analytics"
  is a fine head term, but "who unfollowed me on Mastodon" or "Mastodon
  follower count history" may be the long tail that converts. Use one
  `<title>`, one H1 and one URL per intent, and fold near-duplicates in rather
  than adding pages.

### Community pages (25 topics, 49 pages): A−

These are your best SEO asset: unique curated data, consent-filtered, with
`CollectionPage`, breadcrumbs and per-language hubs. They also earn links,
because the people listed have a reason to link back and boost.

Improve:

- **Tell the listed people.** A post from the project account per topic page,
  mentioning or tagging the community hashtags (not mass-mentioning
  individuals), is the single best link and traffic source available. People
  boost lists they're on.
- **Topic hub depth.** `/communities/` ranks for "Mastodon communities", which
  is broad. Group pages by category with a short paragraph per category
  ("Books on Mastodon": literary, historical, mystery, romance), so
  category-level queries have a page to land on.
- **Freshness signal.** `lastmod` already follows the data. Add a visible
  "Updated <month year>" line. People choose recent lists in results.

### Pure landing pages (`/features/`, `/for/*`, language landings): B

- The `/for/twitter-exodus` and `/for/bluesky` angles are right. Turn them into
  comparison and intent pages people actually search for (§3.2).
- `/` has no visible prerendered content (by owner decision: no marketing page
  before the app). That's fine. The `noscript` overview plus `WebApplication`
  JSON-LD carries it. Don't revisit this.

### Share pages (unfinished): see §3.1. This is the biggest open item.

### Invite page: C (as SEO), fine as product

Invites are personal links, so keep them `noindex`. The SEO value is in the
**unfurl**: an invite link pasted into a chat should show "<Name> invited you
to Mastodon" with a card. Today a non-prerendered URL unfurls as the SPA
fallback. Route it through the same Worker as §3.1.

### Help and news: help B+, news C

- Help: 10 guides, static, fast, with breadcrumbs. Good.
- **News has 2 posts.** A blog with two posts doesn't earn authority. **Decide**
  a cadence you can sustain (twice a month is plenty), aimed at queries rather
  than announcements. See the content list in §3.2. Post every article from the
  project account. Comments are already replies there, so each post is also a
  fediverse thread.

## 3. What's missing altogether

### 3.1 Finish sharing with an edge Worker (distribution first, indexing second)

**Problem.** GitHub Pages can only answer a non-prerendered URL with its 404
shim. Mastodon, Bluesky, Slack, Discord and iMessage unfurlers don't run
JavaScript, so every `mawkingbird.com/@user@host`,
`/<server>/@acct/<id>`, `/bsky/profile/…/post/…` and `/message/<id>` link
shows as a bare link or "Loading…". Google records them as 404s, which is
correct as things stand.

**Approach.** The domain is already proxied by Cloudflare and you already run
Workers (`cors.mawkingbird.com`). Add a Worker on the `mawkingbird.com` zone
that handles only the share URL shapes from `posts/copy-link/deep-links.ts` and
passes everything else straight through:

1. Match the deep-link shapes (reuse the same regexes; have one source of
   truth, or a test that compares them).
2. Fetch public data only: Mastodon `GET /api/v1/accounts/lookup` and the
   status from its issuing server, Bluesky's public AppView. No tokens.
   Respect a server's refusal.
3. Fetch the origin `index.html` and, with `HTMLRewriter`, replace the head:
   `<title>`, description, `og:*`, `twitter:card`, `og:image` (the post's first
   image with alt, or the author's avatar, or a generated card later),
   `fediverse:creator` set to **the author**, and a canonical pointing to
   **the post's home URL** (`status.url`).
4. Return **200** with that HTML. The SPA boots as it does today, because it's
   the same index plus a different head.
5. Cache at the edge (for example 1 hour, `stale-while-revalidate`), keyed by
   path.

**Indexing policy.** Recommend `noindex, follow` on every post and profile
share page.

- These pages mirror someone else's content. The canonical would point to the
  origin server anyway, and Google would index that instead.
- Consent: the Feed Builder already holds a higher bar for publishing people to
  search engines (`discoverable`, not `noindex`, `indexable`). An
  arbitrary-share page can't check consent per viewer, and nobody opted in.
- The payoff is the unfurl. A good card converts the people who see the share,
  and every share then carries a visible "mawkingbird.com" byline. The Twitter
  share intents in `share-dialog.ts` (Reddit, Hacker News, LinkedIn, Tumblr)
  currently send the _origin_ URL. **Decide** whether shares from Mawkingbird
  should offer the Mawkingbird link: it opens for anyone, with a card, which
  is the distribution loop you started building.

**Respect account flags in the card too.** If the author's account says
`noindex` or isn't `discoverable`, still return a minimal card (the sharer
chose to share), but show only the display name and handle, with no excerpt
in the description. Write that rule in `ui/docs/seo.md` and give it a spec
before shipping.

**Later, maybe:** an opt-in "public profile page" a user turns on for
themselves. That would be indexable, since it carries consent. Only build it if
people ask for it.

Gates: Worker unit tests (match/no-match, flags, upstream 404, timeout →
pass-through to the plain index), plus a check that every non-share path is
byte-identical to origin. Deployment follows `DEPLOY.md` Worker rules (test
Worker on `/test/` first).

### 3.2 Content that matches how people search

You have task pages (tools) and topic pages (communities). The missing types
are **comparison**, **choice** and **how-it-works** queries. People ask these
before they choose a client, so they suit the client-first positioning:

| Query family                                      | Page type                                             | Where                                 |
| ------------------------------------------------- | ----------------------------------------------------- | ------------------------------------- |
| "best Mastodon web client", "Mastodon app for PC" | One honest roundup that includes yourself             | `/news/` article, updated yearly      |
| "Mastodon and Bluesky in one app"                 | Landing page (Mawkingbird's main differentiator)      | `/for/` page, or retitle `/features/` |
| "Mawkingbird vs Elk / Phanpy / Ivory / Tusky"     | Fair comparison pages. You already have parity audits | `/compare/<x>/`                       |
| "Mastodon RSS reader", "follow RSS on Mastodon"   | Landing page for RSS mode                             | `/for/` page                          |
| "how to find people on Mastodon/Bluesky"          | Help guide linking the tools and communities          | `docs/`                               |
| "which Mastodon server should I join"             | Guide plus the handle generator                       | `docs/` or news                       |
| "Twitter alternatives 2027"                       | Annual news article                                   | `/news/`                              |

Comparison pages need to be accurate and dated. Your parity audits
(`spec/phanpy_parity.md`, `spec/mastodon_parity.md`,
`ui/docs/bluesky-feature-parity.md`) are already the research. Do **not** frame
any of this as leaving or deleting accounts (house rule: no exit tools).

### 3.3 Off-page: links and listings (owner work, high leverage)

A young domain gains authority mainly from links. Where Mawkingbird
legitimately belongs:

- **joinmastodon.org/apps**: the official app list. Check its submission
  criteria. This listing has the highest value.
- Bluesky's developer showcase / community app directories.
- `delightful-fediverse-apps` (Codeberg), `awesome-mastodon`,
  `awesome-bluesky` (GitHub) lists, via pull requests the owner submits.
- AlternativeTo (listed as an alternative to Twitter, Elk, Phanpy, Tweetdeck),
  Product Hunt, Show HN, fedidevs.com.
- Each community page: a project-account post (see §2).
- The GitHub README and repository "website" field → `https://mawkingbird.com/`.

(Per AGENTS.md, an agent can draft these submissions for review but must not
submit them.)

### 3.4 Brand entity

"Mawkingbird" is a deliberate misspelling, so Google may suggest
"mockingbird". Help it treat the name as an entity:

- An `Organization` JSON-LD on `/` and `/about/` with `name`, `url`, `logo` and
  `sameAs` (both Mastodon accounts, the Bluesky account, GitHub, Read the Docs).
- A consistent one-line description everywhere (Mastodon bio, GitHub, listings).
- **Decide** whether to add a Wikidata item later. Only do it once
  independent sources exist, or it gets deleted.

### 3.5 Measurement (do before building more pages)

- **Split the sitemap by family**: `sitemap-pages.xml`,
  `sitemap-tools-en.xml`, `sitemap-tools-<lang>.xml` (or one for all
  translations), `sitemap-communities.xml`, `sitemap-follow.xml`, with
  `sitemap.xml` as the index. Search Console then reports indexed/submitted
  **per family**, which answers "partially indexed" exactly.
  `prepare-seo-index.mjs` already builds the list, so this is a small change,
  and `check-seo-build.mjs` keeps comparing the union.
- **Weekly check (15 minutes)**: in Search Console → Pages, note the reasons
  ("Discovered – not indexed" means authority or crawl budget; "Crawled – not
  indexed" means quality or duplication; "Duplicate, Google chose different
  canonical" points to a bug). In Performance, look at queries per family.
  Record it in `sprint/` so trends are visible.
- **Bing Webmaster Tools**: you've verified it (`BingSiteAuth.xml`). Also turn
  on Cloudflare **Crawler Hints / IndexNow**. It's one toggle and Bing feeds
  DuckDuckGo and several AI answer engines.
- GoatCounter: create a campaign or referrer view for `mastodon.social`,
  `bsky.app` and `t.co` referrers, so you can measure the Worker's effect (§3.1).

### 3.6 Core Web Vitals on public pages

Public pages bootstrap without hydration, so Angular redraws the prerendered
DOM. Check field data (PageSpeed Insights / CrUX, once there's traffic) for
CLS and INP on `/tools/` pages. If the redraw shows up as layout shift,
**Decide** between Angular hydration for public routes and leaving it. Don't
refactor before the data shows a problem. (The repository has a `web-perf`
skill for that audit.)

## 4. AI crawlers and answer engines

Cloudflare's managed robots.txt (live today) blocks GPTBot, ClaudeBot,
Google-Extended, Applebot-Extended, CCBot and others, and sets
`Content-Signal: ai-train=no`. It also blocks **Baiduspider** and
**PetalBot**, which are _search_ crawlers. That doesn't matter much for you.

Practical effects:

- Google Search and AI Overviews are not affected (Googlebot is allowed;
  `Google-Extended` covers Gemini training and grounding only).
- ChatGPT search (`OAI-SearchBot`), Perplexity and Claude's user-initiated
  fetches aren't in the list, so citations still work.
- Blocking training crawlers means future models know less about Mawkingbird
  when someone asks "what's a good client for Mastodon and Bluesky".

**Decide**: keep the default (privacy and copyright stance), or allow the
training bots for the public marketing, help and news pages only. Whichever
you choose, record it in `ui/docs/seo.md`, because the robots.txt in the
repository no longer matches what's served. Also note that the served file
has two `User-agent: *` groups. Google merges them, but dropping
`ui/public/robots.txt`'s own `*` group or turning off the managed block would
avoid the duplication.

## 5. What not to do

- Don't add arbitrary hashtag or post pages to the sitemap (already a rule).
  Programmatic hashtag pages would be thin and duplicate.
- Don't add `FAQPage`/`HowTo` schema for rich results that no longer appear.
- Don't raise the initial bundle to pre-load SEO data.
- Don't use robots.txt to hide pages that should be `noindex`.
- No pages about leaving, deleting or mass-unfollowing (house rule), and none
  about notifications or push features.

## 6. Phased plan

| Phase                    | Work                                                                                                                                                              | Owner / code | Gates                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------ |
| **0. This week**         | Always Use HTTPS + HSTS; check the github.io hop; decide on the legacy `mastodon_mock` site; GSC Domain property; IndexNow toggle; robots/AI decision             | Owner        | curl recheck of §1 table                               |
| **1. Measure**           | Split the sitemap into families; weekly GSC log in `sprint/`                                                                                                      | Code         | `make test-seo`, `test:seo:browser`                    |
| **2. Share Worker**      | §3.1: unfurl cards, 200 status, noindex, author `fediverse:creator`, invites and `/message/` included; then decide whether share intents use the Mawkingbird link | Code         | Worker tests, test-Worker smoke, DEPLOY.md runbook     |
| **3. Cheap on-page**     | Optimised default OG image; per-page generated OG cards; `fediverse:creator` everywhere; per-tool `WebApplication` + breadcrumbs; `Organization` + `sameAs`       | Code         | `make test-seo`, `test:seo:browser`, build size report |
| **4. Links**             | joinmastodon/apps, awesome lists, AlternativeTo, Show HN; announce each community page                                                                            | Owner        | n/a                                                    |
| **5. Content**           | "Mastodon + Bluesky in one app" landing; 2–3 comparison pages; news cadence aimed at queries                                                                      | Owner + code | `make help-site-test` (docs), `make test-seo` (pages)  |
| **6. Review (week ~10)** | Per-family index rate and impressions → language-retention rule, title rewrites, decide hydration from CWV                                                        | Owner        | n/a                                                    |

Phase 0 needs no code. Phase 1 should land before 3 and 5, so their effect can
be seen.

## Owner decisions needed

1. Legacy `mastodon_mock` Pages site: retire, `noindex`, or leave as is.
2. AI training crawlers: keep the Cloudflare block or allow them on public
   pages.
3. Share pages: confirm `noindex` everywhere plus the author-flag rule for card
   content.
4. Whether Mawkingbird's share dialog offers the Mawkingbird link instead of
   the origin URL.
5. Language-retention rule for tool translations after measurement.
6. News cadence.
