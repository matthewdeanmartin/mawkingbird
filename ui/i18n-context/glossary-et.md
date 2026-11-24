# Estonian (`et`) terminology

Use contemporary Estonian, informal singular **sina**, and singular imperatives.
Omit pronouns in concise controls. Preserve Estonian diacritics (ä, ö, õ, ü, š, ž).
Keep product names, account handles, URLs, code examples and interpolation names
unchanged. Brand names may take Estonian case endings in prose (Mawkingbirdi,
Blueskys); keep the recognizable brand spelling.

| English                                           | Estonian                                   |
| ------------------------------------------------- | ------------------------------------------ |
| Post (noun / verb)                                | postitus / postita; avalda for publishing  |
| Boost / repost                                    | jaga edasi / edasijagamine                 |
| Share                                             | jaga                                       |
| Thread                                            | lõim                                       |
| Feed / timeline                                   | voog / ajajoon                             |
| Home feed                                         | koduvoog                                   |
| Follow / following / followers                    | jälgi / jälgitavad / jälgijad              |
| Mutuals                                           | vastastikused jälgimised                   |
| Mute / block                                      | vaigista / blokeeri                        |
| Unmute / unblock                                  | tühista vaigistus / tühista blokeering     |
| Favourite                                         | märgi lemmikuks / lemmik                   |
| Like                                              | meeldimine                                 |
| Bookmark                                          | järjehoidja; lisa järjehoidja as an action |
| Server / instance                                 | server                                     |
| Handle                                            | kasutajatunnus                             |
| Interface language / posting language             | kasutajaliidese keel / postitamise keel    |
| Settings                                          | seaded; individual settings are sätted     |
| Outbox / offline                                  | väljundkaust / ühenduseta                  |
| Draft                                             | mustand                                    |
| AI                                                | tehisaru                                   |
| Access token / model token                        | pääsutõend / token                         |
| Passphrase / credentials                          | paroolifraas / pääsuandmed                 |
| Proxy                                             | puhverserver                               |
| Paste (published item) / paste (clipboard action) | tekstilõik / kleebi                        |
| Blog roll                                         | blogide loend                              |

Keep social-network and technical senses distinct: Boost means sharing a post,
never signal amplification. A thread is a discussion sequence (lõim), never a
sewing thread. A storm is a postitusteseeria, not a weather event. The fail-whale
joke becomes **Veavaal**. An outbox reply-type label is **Vastus**, while a reply
button is **Vasta**. Distinguish authentication pääsutõend from model token counts.
**Calm**, **Lite**, **Plus** and **Algo** remain recognizable feature names.

Count labels use the Estonian singular or partitive plural as their source keys
allow. Commands like **Jälgi {{count}} kontot** use the same wording even for one
account because of Estonian object case. Avoid assuming English count suffixes
work in Estonian.

The first pass covers exactly 2,758 selected keys, including required Lite/offline
copy and front-door login/search controls. Long editorial prose is deferred;
missing keys retain the English fallback. Mechanical merge checks and formatting
are verified. Native-speaker and narrow/wide visual review remain outstanding;
this is an in-progress locale.
