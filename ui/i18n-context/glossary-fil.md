# Filipino (`fil`)

Use conversational Filipino based on Tagalog. Use `mo`, `ka`, and `sa iyo` when direct address helps. Drop the pronoun when the action or status already makes the subject clear. Prefer short verbs for buttons and plain sentences for warnings and help.

| English                               | Filipino usage                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| post / reply / thread                 | post or i-post / sagot or sumagot / thread                                                                                           |
| boost / repost / quote                | boost for an unchanged Fediverse re-share / repost on Bluesky / quote or i-quote with commentary                                     |
| favourite / like                      | paborito or markahang paborito / like                                                                                                |
| follow / following / follower         | i-follow / sinusundan / follower                                                                                                     |
| mute / block                          | i-mute / i-block                                                                                                                     |
| feed / timeline                       | feed / timeline                                                                                                                      |
| bookmark / saved                      | bookmark or i-bookmark / naka-save                                                                                                   |
| draft / Outbox                        | draft / Ipapadala                                                                                                                    |
| Paste                                 | i-paste for clipboard insertion. For the publishing target, use paste for the hosted item and i-publish bilang paste for the action. |
| sign in / sign out                    | mag-sign in / mag-sign out                                                                                                           |
| access token / API key / AI token     | access token / API key / token, described in the context of the model when it measures AI input or output                            |
| post visibility                       | sino ang makakakita ng post                                                                                                          |
| interface language / posting language | wika ng interface / wika sa pagpo-post                                                                                               |

Keep familiar terms such as app, browser, server, account, profile, and hashtag when they read naturally. Keep service names, exact labels from external setup screens, file paths, example URLs, placeholders, and markup intact. After a number, use the simple count noun, as in `{{count}} post`. Without a number, use `mga` where a plural needs to be explicit.

For offline copy, preserve the difference between a saved reading copy and a queued post. Automatic sending applies only to the account that wrote the post, and queued posts older than half an hour wait for the user. Drafts require attachments to be added again.

For the classifier, `nagbebenta ng porn` is an explicit sale phrase. `Nagbebenta ng porn, mag-message para bumili` is a direct advertisement. `Masaheng pang-isports pagkatapos tumakbo` describes ordinary sports massage.

The initial locale covers 2,758 prioritized keys, including Lite and its required offline strings. The remaining keys use English fallback. A native Filipino speaker should review the translated UI before production promotion, especially visibility options, split clauses around links, and character budgets on narrow layouts.
