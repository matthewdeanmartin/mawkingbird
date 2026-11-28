# Copyedit UI strings

How to clean up English UI copy, and how to hand the result to translation. Written
after the 2026-11-28 pass. The key
list is in [copyedit/2026-11-28-retranslate-keys.json](copyedit/2026-11-28-retranslate-keys.json).

## What UI copy is for

A string in the app answers one question: **what does this do for me, right now?**
Anything else goes to the help site (`docs/`, published at mawkingbird.com/help/),
reached by a link, or gets deleted.

## The problems we fix

Every example below is real, from the 2026-11-28 pass.

### 1. Accidental encyclopedias

Several paragraphs inside a dialog, explaining sampling, refresh rules and edge cases.

> Relationships use your complete follow list. Interactions use up to ten recent pages
> each of notifications, your posts, and Home, plus evidence remembered in this
> browser. Older interactions may be missed. Chatty and Broadcasters need at least five
> observed posts; nobody's individual timeline is downloaded.

**Fix:** keep one sentence in the app and link to a help page with the rest
(`docs/reading/people-lists.md`). The People lists dialog went from four paragraphs to
one line plus "How people lists work".

### 2. Explaining internals or algorithms

How a feature works internally, which isn't what it does for the user.

> These are three separate answers, not a score. Most weight goes to what other people
> did … Behavior counts for less, because software can imitate it …

> A background request that fails reports nothing at all to JavaScript — not a status,
> not a reason. That is the browser's own privacy rule …

**Fix:** move it to docs. Connection Doctor's six-paragraph essay became a "How the
check works" section in `docs/connections/connection-doctor.md`.

### 3. Developer reasoning ("ticket history")

Why the team built it this way, why something is missing, or what the API can't do.

> There is deliberately no media/reply/sensitive filter — `searchPosts` has no such
> parameter, and offering one would mean silently ignoring it.

> Mastodon has no client API for changing passwords — that happens on your instance's
> own website.

> One switch per service, because that is how they break …

> … so a session of reading is one commit rather than twenty.

History of the feature counts too. Users never saw the old version:

> ⚠ Every step is off, so Publish goes straight to the composer — which is exactly how
> it behaved before this wizard existed.

> Turn this on to have the box already open every time, the way it used to be.

**Fix:** state the fact the user needs ("Change your password on your server's own
website.") and delete the reasoning. It belongs in code comments or `spec/`, not in a
string.

### 4. Arguing with the user

Defending a decision as if the reader had objected.

> … but it is your reading list, so set it where you want it.

> Replies, chats and paste shares are never held back — they're urgent, or already
> deliberate.

> … those are your rules and the server's, and one person being trusted is not a reason
> to break them.

**Fix:** say what happens and stop. "Replies, chats and paste shares post right away."

### 5. Fear text

Repeated warnings and reassurances that don't change what the user should do.

> It is stored in this browser's localStorage, never sent to Mawkingbird, and sent only
> to api.github.com. Use a browser profile and device you trust; revoke the token in
> GitHub to invalidate it.

> Just make sure the template you configured points where you think it does.

**Fix:** one fact per credential, saying what the key can do: "This token can read
your GitHub notifications." General advice on trust and revoking lives once, in
`docs/connections/credentials.md`.

**Keep disclosures**, cut to one plain sentence: "Fediverse messages aren't encrypted,
so server admins can read them." / "A proxy can read and change everything it relays."
A disclosure changes a decision. Fear text only repeats itself.

### 6. "A, not B"

Saying something positively and then again negatively, out of fear of being
misunderstood.

> Counted, not estimated. · a reason to look, not a verdict · a reading preference, not
> something the server knows about

**Fix:** drop the "not B" half, or rewrite the sentence positively.

**Keep it when B is a real mistake the user might make:** "That server runs Mastodon,
not Misskey" · "matches cat, not category" · "Mute everywhere, not just in this
search" · "your account here, not a connector". 31 stayed for this reason.

### 7. "Nothing is changed / never sent"

Reassurance attached to a read-only action.

> Uses the same read as "When are your posts done?" above. Nothing is changed.

**Fix:** cut it from anything that only reads. **Keep it right before an action**,
where it answers a real worry: "Nothing is followed until you press Import." · "Nothing
is published until you say so." Empty states ("Nothing here yet") are fine.

### 8. Developer terms

`localStorage`, `sessionStorage`, IndexedDB, SHA-256, endpoint names, OAuth flows,
"REST API".

**Fix:** use plain words ("saved in this browser"), or drop the term. **Keep** "API
key" and "API calls": users paste the keys and spend the calls. The storage diagnostics
page is a developer tool, so its terms stay.

### 9. Positioning copy inside settings

Marketing claims where the user is trying to set something up.

> Nobody else hosts your writing, and there is no blog service that can close your
> account.

**Fix:** delete it. Positioning belongs on public pages and in SEO copy.

### 10. Copies out of sync

The same sentence exists under several keys (the analytics hint appears in settings,
the login chooser and the login page; cancellation text appears in Plans and Plus).

**Fix:** when you rewrite one, search the English locale file for the old wording and
rewrite every copy.

## Why regex and search-and-replace can't do this alone

Search finds **candidates**; judgement decides. Every pattern above has legitimate
uses that a pattern match can't tell apart:

| Search | Finds | But also finds (keep) |
| --- | --- | --- |
| `, not ` | "Counted, not estimated" | "runs Mastodon, not Misskey", "cat, not category" |
| `Nothing is` | "Nothing is changed." after a read | "Nothing is followed until you press Import", empty states |
| `API` | "Mastodon has no drafts API" | "API key", "API calls" budgets |
| length > 280 | encyclopedias | step-by-step certificate instructions people follow line by line |
| `localStorage` | warnings to users | the storage diagnostics page |

Most of the problems have no searchable marker at all. Developer reasoning ("because
that is how they break"), arguing ("they're urgent, or already deliberate") and
positioning ("no blog service that can close your account") only show up when someone
reads the string as a user would.

Mechanical rewrites also break things:

- **Split strings.** Many strings are fragments around a link or `<code>`
  (`whitelist.a`, `<a>CORS proxy</a>`, `whitelist.c`). Read the template before
  rewriting one, or the sentence won't join up.
- **Tests assert on wording.** Some specs check a phrase because it carries meaning
  ("your network is fine", "a consent not yet given"). Keep the phrase, or change the
  assertion to test the same behaviour. Never just delete it.
- **Placeholders and markup.** `{{count}}`, `<strong>` and `&#64;` must survive.

**Method:** use search to build a list, read each string in its template, decide
**shorten / move to docs / delete / keep**, then rewrite by hand.

## Workflow

1. **Find candidates.** Read `ui/public/i18n/en.json`: strings over ~200 characters,
   plus the search patterns above. Source strings live as `// i18n key: text` comments
   in the component `.ts` files. The comments are the source of truth; `npm run
   i18n:extract` regenerates the locale files from them.
2. **Decide each one** using the problems above. For anything moved to docs, add the
   page to the `mkdocs.yml` nav and link it from the app with a plain `<a href=
   "https://mawkingbird.com/help/…" target="_blank" rel="noopener">`.
3. **Rewrite the comment** in the `.ts` file (and `en.json` if you want the change
   visible before extracting). When you remove a key, also remove its `| transloco`
   use from the template.
4. **Check specs** for the old wording: `grep -rF "<fragment>" ui/src --include=*.spec.ts`.
5. **Record the keys.** Write the changed, added and deleted keys to
   `ops/copyedit/<date>-retranslate-keys.json` for the translation pass.
6. **Light checks:** `npm run i18n:extract`, `npm run check:i18n`, `make
   help-site-test help-site`, and `npm run test:subset` on touched specs.

## Handing off to translation

Translation is a separate pass, possibly by a different model or vendor. Retranslating
everything has been very expensive, so translate **only the listed keys**.

Give the translator:

- **The key list** (`ops/copyedit/<date>-retranslate-keys.json`):
  - `changed`: new English; replace the existing translation in every locale.
  - `added`: new keys; translate.
  - `deleted`: remove from every locale. `i18n:extract` usually does this already.
- **The new English** for each key, from `ui/public/i18n/en.json` after extraction.
- **The rules from this runbook.** Translators must not reintroduce what we removed.
  Translate the short English; don't restore detail from the old translation.
- **The house rules:** "Twitter", never "X", in copy. Keep placeholders (`{{…}}`),
  HTML tags and entities exactly. Keep the script tags in starter-pack translations.
  Core-screen strings, Lite included, are translated in every locale (`check:i18n` Rule 2b).

Locales live in `ui/public/i18n/*.json`. After translating, run `npm run check:i18n`.
