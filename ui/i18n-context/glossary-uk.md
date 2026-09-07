# Ukrainian (`uk`)

Foundation, 2026-09-05. Picker: `Українська (у процесі)`; review builds only.
Use modern, concise Ukrainian. Omit the reader pronoun where natural; otherwise
use polite lowercase ви/ваш consistently, never alternate with ти. Buttons use
infinitives; instructions may use polite plural imperatives. Avoid gender guesses:
prefer impersonal wording or the account name. Preserve placeholders, markup,
URLs, handles, code, product names and distinct explanatory examples exactly.

## Social vocabulary

Primary anchor inspected 2026-09-05:
[Mastodon Ukrainian interface](https://github.com/mastodon/mastodon/blob/main/app/javascript/mastodon/locales/uk.json).
Upstream supports дописи, поширення, підписники and заблокувати, but varies its
follow and mute wording. The choices below deliberately make this product consistent.

| English | Use | Distinction |
|---|---|---|
| Post / toot | допис; publish = опублікувати | Never mail or a job position; blog article = стаття |
| Boost | поширити / поширення | Reshare, not paid promotion or amplification |
| Follow / unfollow | стежити / припинити стежити | Following list = підписки; followers = підписники |
| Mute / unmute | приглушити / скасувати приглушення | Personal hiding; audio mute may be вимкнути звук |
| Block / unblock | заблокувати / розблокувати | Distinct from mute; preserve action reversals |
| Instance / server | сервер | Never programming екземпляр for a fediverse server |
| Feed / timeline | стрічка | RSS feed = RSS-стрічка; never animal feed |
| Thread / reply | гілка обговорення / відповідь | Never a physical thread |
| Handle | ім’я користувача | Preserve the exact @user@server identifier |
| Account / current account | обліковий запис / поточний обліковий запис | Not a bank account |
| Like / favourite / bookmark | вподобати / додати до обраного / додати до закладок | Preserve separate actions |
| Filter | фільтр; verb фільтрувати | Content rule, not photographic effect |
| Light / dark theme | світла / темна тема | Not weight |
| Paste product item | Paste | Product name; clipboard action = вставити |
| API call | запит API | Not a telephone call |
| Fediverse | федіверс | Decentralized social network ecosystem |
| Starter kit | добірка для початку | Curated accounts; RSS variant = добірка RSS-стрічок |
| Fail whale | Ой, кит знову бешкетує! | Adapt mascot humour to context; avoid literal failure jargon |
| Interface / posting / known languages | мова інтерфейсу / мова допису / мови, які ви розумієте | Three distinct preferences |
| Settings / save / delete / cancel | налаштування / зберегти / видалити / скасувати | Explicit destructive actions |

## Plurals and existing templates

Ukrainian cardinal categories are one, few, many, other. Integers ending in 1
except 11 use one (1, 21); endings 2–4 except 12–14 use few (2, 24); remaining
integers use many (0, 5, 11, 25). Fractions generally use other. Examples:
1 допис, 2 дописи, 5 дописів, 21 допис. English `count === 1` selection is
insufficient. No ICU compiler is installed: never emit ICU syntax.

For existing complete `.one`/`.other` pairs, author grammatical count-neutral
messages in BOTH keys, e.g. `Дописи: {{count}}`, `Відповіді: {{count}}`,
`Завантажити ще сторінки: {{count}} (запити API: {{count}})`,
`Від останнього допису минуло днів: {{count}}.` Such labelled totals avoid
number-dependent noun agreement while retaining the source information. They
do not mean Ukrainian has only one plural form. Avoid `{{count}} дописів` as a
generic plural: it fails at 2 and 21. Match the actual placeholder names.

Fragments without the number require reading the assembled template. For fixed
`number + translated noun`, an abbreviation such as `{{count}} с` can work for
units, but do not invent unnatural abbreviated social nouns. Report the exact
key and call site when a grammatical reconstruction is impossible. Frozen
English source/context must not change silently; coordinator reconciliation is
required before a bounded source/helper fix. Do not launch a broad plural rewrite.

## Workflow

Review lessons: Native bookmarks is the built-in provider, not a brand. Paste
items are product publications, never вставки. A short-link back-half is its
custom URL ending. Keep translated `{{kind}}` in a gender-neutral record label
when its values have mixed grammatical genders. Ratioed describes replies
outnumbering likes plus boosts, not generic high engagement. Validate the actual
options before rejecting a noun fragment: 5/10/25 all permit учасників.
Notification nouns may serve both one account and a group; use gender-neutral
labels. Friends means accounts being followed. A client-list hint permits adding
any accounts; analytics consent counts pages the reader views. Keep Blue as the
feature name. Provider feed nouns already translated by `feedNoun` remain data.
Search refinement account/account-plural words are translated data used inside
hiddenFrom/onlyLeft; frame whole messages so their grammatical case is consistent
at every use. Mutuals means reciprocal following; a full bundle is filled capacity;
status means a social post; thread reader is a reading mode. Retain explanatory
search-help prose and examples rather than shortening them to fit the batch.
Search's linked-account wording refers to a connected Bluesky account, not a URL.
Last-year filtering is a rolling 365 days. The plans connecting footnote's English
is confused; the verified table counts both free tiers by network address and
only the paid subscription by account. Preserve that verified distinction.

Use the shared fixed 500-key assignments (only final remainder may be smaller).
Reader means режим читання when it names a reading mode, not a human читач.
Use masculine agreement for проксі consistently. Put host-name placeholders in
phrasing that does not require inflecting the injected name (for example bySearch).
Friends in import/export means subscriptions/followed accounts. Production as a
release state is Робоча версія, not industrial production. Pending follow requests
are нерозглянуті. Translation filters act on tags/posts, not languages themselves.
Preserve literal substring examples when they demonstrate whole-word matching;
a replacement example must actually demonstrate the same match behavior.
Connection doctor's Control is Контрольна перевірка (a comparison probe), not
management. CORS origin is джерело. “Missing half” means the second necessary
half. Followed-hashtag results are posts, not accounts bearing hashtags.
Proof-result verbs such as “Read” describe a completed retrieval, not an action
button. Credential locking differs from blocking an account. Preserve case
agreement across inserted links; use articles for blog-writing controls.
Moderation reports are скарги, not звіти. Readability's “firm going” band (40–49)
means difficult reading. Translated origin kinds and split modes are data:
preserve their placeholders with gender/case-neutral framing rather than omitting
them or assuming a masculine origin. Server Friends means Підписки на сервері.
