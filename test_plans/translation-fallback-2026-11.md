# Translation fallback chain (2026-11)

Plan: `sprint/translation-fallback-2026-11.md`. Run against a production build
(`cd ui && npm run build:mockingbird`) or mawkingbird.com after release.

## You need

- **Mastodon M**: an account on mastodon.social (translation configured).
- **Mastodon N**: an account on a server with **no** translation provider
  (`/api/v1/instance/translation_languages` returns `{}`).
- Chrome desktop 138+ (has the built-in Translator) and Firefox (has none).
- Posts to test with:
  - a German post tagged `de`;
  - a German post **wrongly tagged `en`**;
  - an English post tagged `en`;
  - an Esperanto post;
  - a post longer than 600 characters in Spanish.

## Steps

- [ ] M, Chrome: 🌐 on the `de` post → server translates; the line names your server's provider.
- [ ] M: 🌐 on the Esperanto post → no 403 in the network panel if the server doesn't list `eo`; the next engine runs, or the message names what was tried.
- [ ] M: 🌐 on the mis-tagged post → the server is **not** called; the browser translator (or MyMemory) translates "from German".
- [ ] M: 🌐 on the English post → the same-language notice; "Translate anyway" opens "Translate from which language?".
- [ ] M: pick a language in the picker → the result says "Translated from <picked> by <engine>"; Change re-runs it.
- [ ] Chrome, first use of a pair → the download progress shows; a second press is instant.
- [ ] Firefox: the browser engine is skipped silently; Languages settings say this browser has none.
- [ ] N: 🌐 on the `de` post → no request to `/translate` at all; the chain starts at the browser engine.
- [ ] Turn on MyMemory with no email → translate the long Spanish post; check it arrives whole (chunked) and the usage shows characters.
- [ ] MyMemory with an email saved → the request carries `de=`; without one it does not.
- [ ] Turn on Apertium → translate a Spanish post to English with every other engine off; check there are no `*` markers.
- [ ] Anonymous, Chrome: the 🌐 button is present and works through the browser engine; no server calls.
- [ ] Automatic mode on, OpenRouter connected, `autoTranslateUsesAi` off → scroll a foreign feed; no OpenRouter requests.
- [ ] Connector off → its engine is never called (network panel).
- [ ] Every third-party result renders as plain text (paste `<b>x</b>` in a post and translate it; it must show literally).

## Findings

(date, browser, what went wrong)
