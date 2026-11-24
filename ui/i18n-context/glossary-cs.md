# Czech interface glossary (`cs`)

Use informal singular Czech (`ty`) in instructions and neutral infinitives for actions. Address the reader directly where that sounds natural. Prefer gender-neutral notifications that describe the result where idiomatic.

| English              | Czech                               | Usage                                                                                                                                    |
| -------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Post                 | příspěvek / zveřejnit               | Item / publishing action.                                                                                                                |
| Reply                | odpověď / odpovědět                 | Item / action. Network replies are usually `odezva` or `odpověď`, depending on whether the string reports latency or an actual response. |
| Thread               | vlákno                              | Conversation or connected posts. Use `série` for a blog storm.                                                                           |
| Boost / repost       | sdílet / sdílený příspěvek          | Re-share an existing post in the network. Use `sdílet jinde` for external sharing and `citovat` when adding a comment to the re-share.   |
| Favourite / like     | To se mi líbí                       | Use `označení To se mi líbí` when a noun is needed.                                                                                      |
| Bookmark             | záložka / přidat do záložek         | A saved item / the action that saves it.                                                                                                 |
| Handle               | adresa účtu                         | May include a username and server. Use `uživatelské jméno` for a username alone.                                                         |
| Instance / server    | server                              | Mastodon or Misskey server.                                                                                                              |
| Feed / timeline      | kanál / časová osa                  | Distinguish a feed source from an ordered timeline.                                                                                      |
| Mute / block         | ztlumit / zablokovat                | `Zrušit ztlumení` and `odblokovat` reverse these actions. Use `skrýt` for hiding content.                                                |
| CW / sensitive media | upozornění na obsah / citlivá média | Keep the warning and the media flag distinct.                                                                                            |
| Paste                | vložit / úryvek                     | Clipboard action / text published via a paste service.                                                                                   |
| Draft / Outbox       | koncept / K odeslání                | A draft is editable. The Outbox holds posts awaiting automatic or manual sending.                                                        |
| Sign in / connect    | přihlásit se / propojit             | Sign in to an account / connect a service to the app.                                                                                    |
| Connection           | připojení / propojení               | Network transport / service integration.                                                                                                 |
| Token                | přístupový token / token            | Access credential / unit of model input or output.                                                                                       |
| Fail Whale           | Velrybí trable                      | Short footer link for service failures.                                                                                                  |
| Calm                 | Klidový režim                       | Keep consistent in home filters and digital wellness settings.                                                                           |

Czech has more cardinal forms than the existing English-derived `one` and `other` keys can represent. Where the whole label is available, prefer a count after a label or in parentheses, such as `Počet příspěvků: {{count}}`. Review counts supplied separately from their labels in the UI.

Keep product names, example addresses and literal field names from external developer consoles as written. Preserve code, markup, and placeholders, including their case. The public picker endonym is **Čeština**. A native-speaker review should precede production promotion.

For adult-content phrase matching, `erotická masáž` and `erotické masáže` are idiomatic. `Erotická masáž po domluvě` is an advertising example. `Sportovní masáž po běhu` refers to an ordinary sports massage.
