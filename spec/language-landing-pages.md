# Per-language landing pages

Status: proposal, 2026-10-31, revised after review. Nothing built yet.

Goal: be the Mastodon app people find when they search in their own language,
and set them up for their languages in one sitting. German first; English
alongside as the reference (and for learners).

## The page

A focused tool page like the others: a pitch while signed out, a settings tool
once signed in. It does not show posts; the home feed at `/` does that.

**Signed out: the pitch.** Prerendered, written in the page's language.

> Mawkingbird has more for German speakers, bilinguals and language learners
> than Mastodon's own app. Sign in and we'll set it up for the languages you
> read and the ones you're learning. Then your home feed is better.

Followed by what that means, each claim backed by a shipped feature:

| Claim | Feature |
| --- | --- |
| The whole app in German | Interface language (15 production locales) |
| Only languages you read in your feed | "Hide posts in languages I don't know" on Home and Algo, with language detection |
| "Just German today" without unfollowing anyone | Feed language picker |
| Translations under posts in languages you're learning | "Languages I'm learning", optional automatic translation |
| Trending hashtags you can read | Trends filtered by script |
| Your posts reach German readers | Default post language written to your Mastodon server |
| People to follow | 21 German starter packs in the app |

Then **Sign in with Mastodon**, returning to this page (`?next=`, as the other
tools do), and a few questions in German.

**Signed in: optimize.** Back on the same page, one checklist and one Apply.
Each item says where it is stored (this browser, this account, your server),
as the onboarding cards do:

- Interface language: Deutsch. Only on Apply; arriving on the page never
  switches it.
- Languages I know: Deutsch, plus "I also read English?" (yes/no).
- Default language of my posts: Deutsch (written to the server; show before → after).
- Hide posts in languages I don't read, on Home and Algo.
- Trending hashtags only in scripts I read.
- Languages I'm learning, with translation under the original (unticked).
- German starter packs: opens the catalogue on "My languages" (unticked; it is
  a list of people, the reader's call).

After Apply: a summary of what changed, a prominent **Go to your home feed**,
and `FocusedNextSteps` for making Mawkingbird the everyday app.

**Variants from the same template:**

- `mastodon-auf-deutsch` (German speakers)
- `learn-english-with-mastodon`: in English, for learners of English anywhere.
  Same checklist with "Languages I'm learning: English" ticked and translation
  under the original. Likely the biggest audience of the lot.
- Later, same pattern: `englisch-lernen-mit-mastodon` (German copy) and
  `learn-german-with-mastodon`.
- `mastodon-in-english`: the English reference version.

## Routes

The path is a minor ranking signal; the title, H1, body copy and links carry
most of the weight. A readable path still helps: it shows in the result, the
searched words are highlighted in it, and people read it before clicking. So:

- One slug in the page's own language, ASCII (`ä` → `ae`, `ß` → `ss`):
  `mastodon-auf-deutsch`, `learn-german-with-mastodon`.
- No `/de/` prefix needed; the page declares its language (`<html lang>`,
  `hreflang`).
- Pick slugs once. A rename costs a redirect and months of ranking.

## Copy: in the page, one language each

The SEO pages are prerendered and nearly JavaScript-free, and their copy lives
in the page, as the tool pages' does today. A German page is written in German
only. No entry in the app's translation dictionaries, no French or Indonesian
versions of it. Native-written or native-reviewed before it is indexed.

Signed in, the settings items reuse the app's own controls, which are already
translated into German through the app dictionaries; nothing new to translate
there.

## Tools in other languages

The SEO tool pages (`focused-tools.json`) are English. To own their searches in
German, then other languages:

**Every tool, in German.** Germans search for the same tasks as English
speakers, in German, on google.de, and a German page outranks an English one
for a German query. So every tool gets a German page; Search Console data only
decides the order, not whether.

**One tool, several registry entries.** A localized page is a new entry that
reuses the tool's component:

```json
{
  "id": "download-media-de",
  "translationOf": "download-media",
  "lang": "de",
  "path": "mastodon-bilder-herunterladen",
  "title": "Bilder von einem Mastodon-Konto herunterladen",
  "description": "…",
  "prerenderCheck": { "heading": "…", "copy": "…", "tool": "app-media-download-workbench" }
}
```

Routes, sign-in return, sitemap, /tools and the nav already read the registry.
New: `lang` and `translationOf`.

**Copy per page.** The page component takes a copy object for its language
(`download-mastodon-images.copy.de.ts`): headings, steps, questions. Some
workbenches have English written into their templates (the media and
similar-hashtags workbenches, the bookmark exporter); those strings move into
the copy object first. Shared dialogs they open (download dialog,
similar-hashtags panel) already have German in the app dictionaries; on a
German page they should render German without switching the visitor's app
language. Transloco can take a language per pipe or scope; prove it on one
dialog first.

**SEO plumbing, once:**

- `<html lang>` from the entry, prerendered and after client navigation.
- `hreflang` both ways between an entry and its `translationOf`, `x-default` to
  the English page, `xhtml:link` alternates in the sitemap.
- Canonical stays self-referencing per language.
- A German tools index (`mastodon-werkzeuge`), linked from the German landing page.
- `check-seo-build.mjs` checks per entry: lang, reciprocal hreflang, heading
  and copy, tool not prerendered. `seo.md` currently says public pages are
  English only; that section gets rewritten.
- Canary and test stay `noindex`.

**Measure before expanding.** 6–8 weeks of GoatCounter and Search Console per
batch before the next tools or the next language.

## Constraints

- **People on indexable pages.** The German packs come from the larger
  catalogue, which does not honour `noindex` (ui/docs/seo.md). The page can say
  "21 German starter packs"; it never lists who is in them.
- **Honest claims.** Translation depends on the reader's server (or an
  OpenRouter key); the copy says so.
- **German review.** Who reviews German copy before it goes live?

## First slice

1. `mastodon-auf-deutsch` and `mastodon-in-english`: signed-out pitch, sign-in
   return, signed-in checklist with Apply, then Go to your home feed.
2. The `lang` / `translationOf` registry fields and the SEO plumbing above.
3. `learn-german-with-mastodon` / `englisch-lernen-mit-mastodon`.
4. The first German tool pages, picked by keyword data.
