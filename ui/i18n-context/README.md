# Translation context

`en.context.json` is the **translator's brief**: one entry per key explaining what the string
means, where it appears, how much room it has, and which app jargon it uses.

## Why this directory is not `public/i18n/`

`angular.json` copies `public/**/*` into the build verbatim, so anything under `public/i18n/`
ships to every browser. The context file is build-time only — it would roughly double the i18n
payload while being useless at runtime. It lives here instead, and only `scripts/i18n-todo.mjs`
reads it.

## Why it exists at all

Hand a model `{"status.boost.action": "Boost"}` and ask for Chinese, and you may get the verb
meaning *amplify / promote* — or something in the register of a municipal economic-development
slogan. The model is not being stupid; it was handed a word with no referent. `Boost` here is a
fediverse noun-verb meaning "re-share someone else's post, unmodified."

The same trap covers most of this app's vocabulary: post (not fence post), toot (not a horn),
handle (not a grip), instance (not an example), feed (not feeding), thread (not sewing), mute
(distinct from block), fail whale (a joke, not a marine incident).

## The economics

Context is written **once per key, in English**, and reused unchanged for every language forever.
One writing cost amortized across 60 locales. That is the whole reason the epic's marginal cost
per language is near zero — see `../../sprint/ui-i18n-0-overview.md`.

## Coverage is deliberately incomplete

Most keys (`Cancel`, `Save`, `Settings`) are unambiguous and need nothing. Requiring an entry per
key would be thousands of units of make-work, and would train everyone to write `"desc": "the
save button"` to silence a gate.

The rule worth enforcing, and the only one that is: **a key whose English contains a glossary
term must have an entry.** That is precisely the fence-post case, and it is mechanically
detectable.

## Adding an entry

See the `$schema` block at the top of `en.context.json` for the field list. `desc` is the only
required field. Write it for someone who has never seen the app.
