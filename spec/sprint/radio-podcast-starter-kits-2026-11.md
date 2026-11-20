# Podcast starter kits for Radio (November 2026)

Status: implemented locally in three sprints; full build-server gates pending.
Owner decisions: 2026-11-19.

## Product decision

The cold start in Radio should offer people and shows to listen to. A visitor
should not have to know an account handle or invent a search query. Add a
**Starter kits** tab beside Saved and Find under Singles, and point Radio's
empty Now Playing state to it. Keep `/radio`, `/singles`, `/singles/find`,
`/playlists` and existing shared links working. The new kit route belongs to
Singles; the exact path is `/singles/starter-kits`.

Kits are grouped by **subject** and language. A show can appear in several
subject kits. The media classification is independent of subject and can have
several values for one account. It describes evidence observed **when the kit
was built**, with a timestamp, rather than promising how every future post
will play:

1. **Native Mastodon audio:** an audio attachment on the account's own post;
   plays in Radio and can advance in a playlist.
2. **Full in-app player:** a linked provider recording that Radio can play in
   full and advance after. Verify actual provider behavior; a recognized URL
   alone is insufficient.
3. **Open elsewhere / short or non-advancing player:** a link that leaves the
   app, a sample, or a player that cannot advance in a Radio playlist. Show
   these honestly, without a Play all promise.

An account may carry all three. Keep the source kind and example post URL in
private evidence, export only the displayable kinds and suitable public links.
Do not infer a full episode from a YouTube URL or from a music provider's
generic `audio` type. The creator or show must identify itself as a podcast,
and at least one of its **latest 80 public posts** must contain relevant media
or a relevant episode/show link. Inspect the latest 80 returned posts at the
home instance; do not replace this with a month/year activity cutoff. Boosts
may be discovery leads but do not establish the account's own podcast media.

Podcast creators are public personas. As with the YouTubers pipeline, do not
apply `discoverable`, `indexable`, `noindex` or follower thresholds as automatic
exclusions. Skip locked, suspended, limited, unavailable and tombstoned
accounts; follow migrations and review the final home account. Do not export
rejected accounts or post text. Review for adult content, hate, spam and
radical/anti-democratic politics on either side. Mainstream left, centre,
right, apolitical work and democratic civic discussion are eligible. Preserve
review decisions separately from refreshable crawl evidence.

## Starting evidence and limitations

The sibling `mawkingbird_starters` Feed Builder cache has 20,447 account
records. A name/bio and profile-field scan found 472 podcast leads. Only 259
of those have saved post samples; among them, one account had a native audio
attachment, 88 linked YouTube, 22 linked a podcast platform and six linked
SoundCloud/Mixcloud. These counts overlap. This is a discovery baseline,
not an eligible-member count: the cache was collected for other topics, the
post sample is incomplete, and links need show/episode and playability review.

Reuse the YouTubers pipeline's home-instance resolver, polite HTTP, tombstones,
language/category taxonomy, private SQLite evidence, durable review decisions,
report and schema-validated export. Reuse Radio's actual provider/playlist
capability model when labelling playability. The existing app starts Radio mode
at `/singles`; `/radio` is Now Playing. No route replacement is needed.

## Sprint 1 — collect and classify evidence

- Add a podcast candidate pipeline in `mawkingbird_starters`. Seed it from the
  cached catalogue and Feed Builder podcast claims/fields, then add public
  podcast discovery sources so the initial cache is not the universe. Keep
  source provenance and deduplicate by resolved home account.
- Resolve at the home instance, follow moves, and fetch up to 80 most recent
  public statuses per account with the shared per-host limits and outage
  handling. Persist evidence incrementally and make refresh resumable.
- Identify a self-claimed show, its public show/feed URL when present, subject
  hints, language and podcast-related post evidence. Record native attachments,
  linked direct files, in-app full players, short/sample players, and outgoing
  links separately. Record enough detail to review ambiguous cases; do not
  advertise a provider as full-length or queueable without verification.
- Report candidates by source, found shows, media kinds, ambiguous links,
  languages, failures and gate reasons. A fresh crawl must distinguish “none
  observed in 80 posts” from “the server did not answer.”

**Exit:** a reproducible report and targeted Python tests for pagination,
deduplication, account gate and media classification. No client change yet.

## Sprint 2 — review and publish catalogue data

- Produce compact private review batches with the show's own claim, subject
  hints and representative public post/episode evidence. A reviewer decides
  show identity, subject categories, language, content safety and ambiguous
  media tiers. Do not publish unreviewed candidates. Retain explicit out/hold
  decisions and recheck eligibility at export.
- Export a versioned index and per-language, per-subject packs from reviewed
  shows. One show may be in multiple packs; one show is deduplicated within a
  pack. Include account, show title, safe short description, subject, observed
  media kinds, evidence date, and public account/show/episode links where
  appropriate. Keep raw post text, rejected accounts and review notes private.
- Add a schema, importer contract and fixture-based validation. Do not pad
  sparse kits or fabricate native/continuous playback badges.

**Exit:** reviewed packs with source counts, inclusion/exclusion summary and
schema/import checks. The publication snapshot states when its media labels
were observed.

## Sprint 3 — Radio discovery and cold start

- Import the reviewed catalogue lazily. Add `/singles/starter-kits` and a
  Starter kits tab alongside Saved and Find. The page starts with subject kits,
  then shows accounts and available podcast links, with clear media badges.
  It works signed out; following requires a Mastodon account.
- Make the empty Saved Singles and empty Now Playing states lead to Starter
  kits. Keep Find Singles (including its handle form), playlists and the
  existing Radio playback/share links. Add a helpful kit pointer to other
  relevant empty Radio surfaces instead of introducing a new top-level mode.
- For a member, offer the public account and a route to its recent eligible
  media. Only display Play/queue actions for tracks that Radio can actually
  play and advance; external/short media opens with an honest label. Preserve
  the existing provider-consent flow.
- Add focused component/route tests and a small browser check for signed-out
  cold start, tab navigation, badges and playable versus outgoing actions.
  Check deep links and design inventory if the new route/controls require them.

**Exit:** a visitor can choose a subject without knowing a handle, inspect a
show's media types, follow it or open a suitable recording, and return to
Singles or Now Playing without losing existing links.

## Gate cadence and handoff

Run targeted Python tests and static checks for the pipeline; for the client,
run affected Angular specs, changed-file formatting/lint, route audit and the
one relevant design browser file. Record each run and any deferred check here.
Do **not** run the full local quality gates during the three sprints. After all
three sprints, hand the combined tree to the build server for the full unit,
production-build, SEO and design gates required by `AGENTS.md`; record their
results when available. Do not commit, push or publish without the owner's
separate instruction.

## Sprint evidence (2026-11-19)

**Sprint 1 complete.** The sibling pipeline collected 935 candidate handles from
the existing catalogue, Feed Builder evidence and public podcast tags, and
resolved 933 home accounts. It fetched up to 80 latest posts per account and
kept partial server failures distinct from absence of media. The current
report records 462 accounts passing the mechanical gate, including 8 with
native audio and 60 with short-form links. Raw evidence and compact review
batches remain ignored/private. The reproducible aggregate is
`../mawkingbird_starters/data/podcasts/report.md`.

**Sprint 2 complete.** All 462 mechanically eligible accounts have decisions:
186 in, 22 out and 254 hold. Holds remain in the next review queue. The
versioned export contains all 186 approved shows in 74 subject/language kits,
246 memberships and 11 languages. It includes 628 outgoing, 23 short,
6 full-player and 3 native media entries (an account may appear in multiple
kits, so these are entry counts). The full-player marks were limited to
reviewed direct audio, SoundCloud and Mixcloud episode URLs that Radio can
advance. Each kit displays the snapshot date; the source and example post URL
are preserved. No pack is padded to a minimum size.
Representative provider checks returned complete SoundCloud episodes of
57:31 and 41:33 with embeddable widgets, a 32:20 Mixcloud episode with an
embeddable widget, and an 11.5 MB `audio/mpeg` direct episode file.

**Sprint 3 complete.** `/singles/starter-kits` is a lazy route and the third
Singles tab. The overview fetches only the index; selecting a kit fetches its
members. Empty Saved Singles, Now Playing, Playlists and Find Singles now
offer the kits. The kit page shows subject, account, show URL, media tier,
public post, follow action and Find this account link. Only native and
verified advancing sources get Play in Radio. The existing routes remain.

**Focused checks passed.** Sibling Ruff lint/format, mypy, and 9 targeted
Python tests; podcast schema export and app importer validation; 2 importer
tests; 18 affected Angular tests; changed-file Prettier and Angular lint;
i18n extraction/check; design inventory reconciliation/check; deep-link
source audit (0 broken) and subpath check. The existing deep-link targeted
suite passed (51 Angular and 4 shim tests) after the route was added. The
Radio browser script now covers anonymous kit navigation and Play versus
outgoing actions, but was not run locally because it serves the production
build.

**Build-server handoff.** Run the combined-tree gates once, cheapest first:
`cd ui && make test`, `npm run build:mockingbird`, `make test-seo && npm run
test:seo:browser`, `make design-verify`, `npm run test:radio:browser`, and
`make test-deep-links-browser`. Run `make test-integration` for the client
integration contract. Record the results here. No full local gate, commit,
push or publication was performed.

## Follow-up: language and profile links

The Radio kits now reuse the same Pack languages control as the curated
starter-pack page. On a new visit, the podcast view matches the browser's
language chain against available packs, falling back to English. An explicit
choice is stored in client preferences; Browser language clears that choice.
The picker stays visible while a selected kit loads, and account handles
open `/accounts/@user@host` inside Mawkingbird. A focused browser smoke with
`de-AT` verified the German default, category navigation, English persistence
after reload, Browser language reset, and the Analyse Podcast profile route.
Focused Angular and deep-link tests passed; the combined full gates remain
deferred to the build server.

## Follow-up: playable media posts

The 80-post gate now accepts native Mastodon audio/video or exact episode/item
URLs supported by Mawkingbird's inline players. Generic podcast sites, Spotify
show/profile links, Apple Podcasts show pages without an episode ID, social
profiles and unsupported shorts no longer qualify. The existing evidence cache
and 462 review decisions remain in place; the export was regenerated from that
cache without a new crawl or review reset. The current snapshot has 129 unique
shows in 60 kits, 172 memberships, and 305 recent post previews. Each account
card shows up to two newest qualifying posts, with a bounded text excerpt,
media URL and type, content-warning state, home server, home status ID and canonical
post URL. Native and supported external media can be played in the kit; Open
post resolves inside Mawkingbird and rehydrates from the home server. Find this
account's singles remains the route to more posts. Radio play is offered only
for native audio or reviewed advancing providers.

Focused checks for this follow-up: 10 Python podcast tests, 2 importer tests,
7 kit-page Angular tests, and the 51 Angular plus 4 shim deep-link tests passed.
The source-only deep-link audit reported 0 broken contracts. The design
inventory was regenerated and its kit-page findings and shared picker candidate
were reviewed and reconciled. Full gates remain deferred to the build server.

For a monthly refresh, run `make pod-crawl`, inspect `make pod-report`, review
new or changed candidates, then `make pod-export` in the sibling repo; run
`cd ui && npm run podcasts:update` here. The crawl reuses the SQLite evidence
store and `data/podcasts/decisions.json`; a reviewed account drops from the
snapshot if its last 80 posts no longer meet the gate. A reviewed show may
still link to a guest appearance; manual review should check show ownership.

## Open implementation choices to verify from evidence

- A show with several hosts: choose its show account over a host's personal
  account where both post the same episodes; retain a host only when it has
  independent, relevant media.
- The latest 80 public posts include replies in the scan window; replies can
  provide evidence only when authored by the account and clearly about its
  show. Boosts never qualify on their own.
- Provider capability is checked against Radio's current actual behavior at
  build time. If a provider cannot be verified, label it as open elsewhere.
