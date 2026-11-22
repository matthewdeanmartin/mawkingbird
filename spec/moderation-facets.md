# Adult facet, people by language, and reporting with care

Status: design agreed with the owner, 2026-11-22. Sprints in
`spec/sprint/moderation-facets-2026-11.md`.

## Why

Mawkingbird serves young people, adults, and adults who post adult content.
Mastodon has CW and "sensitive media"; Bluesky has labels and is heading for
age verification. What no client has is a way to **facet by adult content**:
*adult / not adult / either*.

That facet has more uses than finding porn (legal in most places):

- **Moderators** of a "no porn" server looking for ToS violations.
- **People looking for people who speak their language.** On Mastodon, language
  is about the only working way to find people near you. It works for small
  European languages and poorly elsewhere. Today, "posts in Malay" or
  "Indonesian posts" returns mostly sex-work advertising, so a Singaporean
  looking for Malay speakers gives up.
- Unfortunately also governments hunting people under purity laws. The data
  is public already; we make it easier to see, not more exposed. The owner
  chose to offer all three facet values to everyone (decision table).

The second half is **reporting**. The `...` menu has "Report", but nothing makes
sure the reporter knows whose rules apply, where that server is, and whether a
report is the right tool at all. Moderators and account holders get upset
when people pick the sledgehammer (a report) when they should mute or block.

## What exists (inventory, 2026-11-22)

| Area | Today | Gap |
| --- | --- | --- |
| Post search language | Select with 7 fixed languages (`search.ts` `languages`) | Ignores the user's own languages and the app's 20 localizations. No Malay, Indonesian, Esperanto. No way to pick any other language. |
| Post search sensitive | Tristate sends `is:sensitive` / `-is:sensitive`, plus a client facet | Sensitive ≠ adult: people CW food, politics, spoilers, mental health. |
| People search facets | domain, bot, follow policy, followers, posts, last active (`account-refine.ts`) | No language, no adult. |
| Directory | order + local only (the API takes nothing else) | No language, no adult. |
| Report dialog | category (spam / violation / other) → server rules when violation → comment → opt-in forward. Bluesky: reason list + labeler choice. | No `legal` category (admin side has it). No triage toward mute/block. No "who reads this / whose rules / which jurisdiction". Rules only appear after choosing "violation". |
| Server about | `ServerAbout` caches rules + ToS per server | Jurisdiction is free text inside huge ToS/About pages. |
| Bluesky | `adultContentPref`, labels on posts/accounts | Not used for search facets. |

## What the servers can and cannot do

Mastodon post search (full-text search servers, opted-in posts only) takes
`language:xx`, `is:sensitive`, `has:media`, dates and `from:`. Everything else
is client side:

| Need | Server side? | Plan |
| --- | --- | --- |
| Posts in language X | yes, `language:xx` | Send it. |
| Posts flagged sensitive | yes, `is:sensitive` | Keep the Sensitive facet as-is. |
| Adult posts | no | Client classification of the loaded page. **Never** send `-is:sensitive` for "hide adult": it would drop food CWs too. |
| People who post in X | mostly | One `language:xx` post search, condensed to authors (`condenseStatusesToAuthors`). The cheap, main path. |
| People search by language | no | Infer per account (bio detection, post tags, home server's languages). |
| Directory by language/adult | no | Load pages, filter client side. |
| Hashtag timelines | no | Fetch pages within budget, filter client side. |
| Jurisdiction | no | Crawled offline (below). |

**Budget.** Web works with a small budget of API calls per action: 2–5,
sometimes 10, at which point we ask before spending more (the search page's
existing budget and "Load more"). Native has the local archive cache: bio plus
many posts per author, instantly. Hence the roadmap item **High-performance
client-side search in Native** (see `mawkingbird_native/spec/local_archive_roadmap.md`).

## Decisions (owner, 2026-11-22)

| Topic | Decision |
| --- | --- |
| Adult facet values | **Hide / Only / Either**, on posts *and* people, **for everyone**. |
| Adult vs sensitive | **Separate facets.** Sensitive stays Mastodon's literal flag. Adult is our inference. |
| Adult scope | **Sexual content only**: porn, nudity, sex work, kink. Gore, drugs and other CWs stay under Sensitive. |
| Evidence | Bio/display name self-declaration; recent posts whose CW or media points to sexual content; home server reputation; Bluesky labels (self and labeler). |
| Default | A **persistent user setting** that starts at **Either (show all)**. People mark lots of non-sexual things sensitive. |
| Hidden items | Collapse to a one-line **"⟨reason⟩ (i)"** row. (i) explains why the account or post was classified, with the evidence. One tap shows it. |
| Language widget | Post search shows **the user's languages** (known + learning + posting default) and **every language the app is localized into**. A **separate "All languages…" widget** finds any language by typing. Never a 3000-row (or 195-country) select. |
| People by language | Language facet on People search, a "People who post in X" mode, and a language filter on the Directory. Client side; fine on Native. |
| Report triage | Use the proposed flow: *What's going on?* first, with "I just don't want to see this" leading to mute / block / filter / hide and no report. |
| Report gate | A **gate before the dialog**: whose server, where it is, its rules and legal pages. Shown once per server and again when its legal text changes. |
| Jurisdiction | For the **25 largest servers and the largest server per country**, crawl ToS/About and extract the *self-declared* jurisdiction with an LLM. Show it with a warning: "When last crawled, the jurisdiction was Helsinki, Finland. See Terms or About for the full legal notices, if any." |
| Legal category | Add `legal` ("It's illegal") to the user report categories. |
| Moderation endpoints | Full admin support is far off; only `mastodon_mock` exposes them. Test reports against the mock. |

## Design

### 1. Language choice

`language/language-catalog.ts` (pure): every code Mastodon accepts for a post
(ISO 639-1 plus its ISO 639-3 additions such as `tok`, `ast`, `ckb`). Names
come from `Intl.DisplayNames` in the reader's locale, plus the endonym, plus
English, so typing "Malay", "Melayu" or "ms" all find `ms`.

- `suggestedLanguages()`: the current choice, the user's languages, then the
  app's localizations, without duplicates. This is the short list a select may
  show.
- `<app-language-finder>`: a combobox (type to filter, arrow keys, Enter) over
  the catalogue, showing at most a dozen matches. It lives in a dialog opened
  from "All languages…". It is a separate widget, never inside the select.

Reused later by People search, the Directory and "People who post in X".

### 2. Adult classification

`moderation/adult-content/` (pure core, no Angular):

```
classifyStatus(status) -> AdultVerdict
classifyAccount(account, statuses[], serverHint?, labels?) -> AdultVerdict
AdultVerdict = { adult: boolean, confidence: 'self' | 'strong' | 'weak' | 'none',
                 reasons: AdultReason[] }
AdultReason  = { kind: 'bio-marker' | 'cw-sexual' | 'media-sensitive-with-sexual-cw'
                 | 'bluesky-label' | 'server' | 'share-of-posts', detail, count? }
```

- **Self-declared markers** in bio/display name/fields: `18+`, `🔞`, `NSFW`,
  `MDNI`, `minors DNI`, `adults only`, `R18`, plus a small, documented,
  multilingual lexicon (sex-work advertising markers used in Indonesian and
  Malay posts such as `open BO`, `VCS`). Word-boundary matching; tests for
  false friends.
- **CW classification:** a CW (`spoiler_text`) is *sexual* when it matches the
  sexual lexicon, *other* otherwise ("food", "politics", "spoilers", "mh").
  A sensitive post with no CW and sensitive media is *unknown*, not adult.
- **Account:** adult when self-declared, or when enough loaded posts are
  sexual (threshold over the posts we have, stated in the reason: "6 of 9
  loaded posts have sexual CWs"), or a Bluesky porn/sexual/nudity label, or
  the home server is on the shipped adult-server list. Weak evidence is shown
  but never decides alone.
- Every verdict carries reasons; the (i) explainer renders them.

### 3. Adult facet in search

- `adultFilter: 'either' | 'hide' | 'only'`, a client pref (synced), default
  `either`, mirrored as a search criterion (in the URL so a view is linkable).
- Posts: classify loaded posts. People: classify the account from its bio plus
  the posts already loaded (post search condensed to authors gives these for
  free); fetching a person's recent posts costs one call each and comes out of
  the search budget.
- Hidden rows collapse to "Adult content: bio says 18+ (i)". The count is in
  the facet ("12 hidden as adult").
- Bluesky: map labels; respect `adultContentPref` (Bluesky hides adult content
  server side when it is off; we say so).

### 4. People who speak my language

- Account language inference: post `language` tags of loaded posts, our own
  detection over bio and post text (`language-detect`), home server's declared
  languages (`/api/v2/instance` `languages`). Malay/Indonesian are close; a
  split between them is marked low confidence.
- **People search:** Language facet over loaded people.
- **"People who post in X"** mode: `language:xx` post search (server side),
  condensed to authors, ranked by matched posts and recency, adult facet
  applied, budget 2–5 calls with "Load more".
- **Directory:** language and adult filters over loaded pages, with budget.

### 5. Report flow

1. **Gate** (before the dialog, per server, re-shown when the legal text
   changes): "Reports from your account go to the moderators of
   *your.server*. When last crawled, its jurisdiction was *X* (see Terms /
   About). They apply *their* rules." Links to rules, Terms, About. One
   "Continue".
2. **What's going on?**
   - I just don't want to see this → Mute, Block, Hide this post, Add a filter.
     No report.
   - It's spam → spam.
   - It breaks a rule of *server* → rules checklist (required when rules exist).
   - It's illegal → `legal`, with a note on the jurisdiction.
   - Something else → other.
3. **Details**: comment; forward to the author's server (opt-in) naming that
   server and linking its rules.
4. **Receipt** stays as today (Report history).

Bluesky keeps its reason list; the gate names Bluesky Moderation (or the
chosen labeler) instead of a server.

### 6. Jurisdiction crawl

`ops/jurisdiction/` script (Make target): pick the 25 largest servers and the
largest server per country (from the existing server lists), fetch
`/api/v1/instance/terms_of_service` and `/api/v1/instance/extended_description`,
ask Claude for the self-declared jurisdiction (structured output with a quote
of the sentence it relied on, or "not stated"), write
`ui/src/app/moderation/jurisdiction/jurisdictions.generated.json` with crawl
date and a content hash. The gate uses the hash to decide whether text changed.
The quote is shown on request, so a reader can check the LLM.

## Out of scope

- Age verification itself.
- Server-side moderation dashboards beyond today's admin screens.
- Geolocation beyond language.
