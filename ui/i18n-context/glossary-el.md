# Greek (`el`) terminology

Use modern Greek with informal singular address (`σου`, `εσύ`). Prefer concise
nouns for controls and singular imperatives in guidance; avoid switching to polite
plural. Keep accents in mixed-case labels and use Greek quotation marks (`«…»`).

| English                      | Greek                                   |
| ---------------------------- | --------------------------------------- |
| Post (noun / verb)           | ανάρτηση / δημοσίευση                   |
| Boost / repost               | αναδημοσίευση                           |
| Quote                        | παράθεση                                |
| Thread                       | νήμα                                    |
| Feed / timeline              | ροή / χρονολόγιο                        |
| Follow / followers           | ακολούθηση / ακόλουθοι                  |
| Mute / block                 | σίγαση / αποκλεισμός                    |
| Unmute / unblock             | άρση σίγασης / άρση αποκλεισμού         |
| Favourite                    | προσθήκη στα αγαπημένα                  |
| Like                         | «μου αρέσει»                            |
| Bookmark                     | σελιδοδείκτης                           |
| Server / instance            | διακομιστής                             |
| Handle                       | όνομα λογαριασμού                       |
| Interface / posting language | γλώσσα διεπαφής / γλώσσα δημοσίευσης    |
| Draft / outbox               | πρόχειρο / εξερχόμενα                   |
| Offline / data saver         | εκτός σύνδεσης / εξοικονόμηση δεδομένων |
| Moderation                   | συντονισμός                             |
| Settings                     | ρυθμίσεις                               |
| Calm / Algo                  | Ηρεμία / Αλγόριθμος                     |

Keep product names, account addresses, URLs, technical identifiers, placeholders
and emoji unchanged. `Paste` names a pastebin item/service here; it stays `Paste`,
while the clipboard verb is `επικόλληση`. `Boost` re-shares a post, rather than
amplifying a signal. Network requests are `αιτήματα`; API calls are `κλήσεις API`.
`Light` as a theme is `Φωτεινό`, not a weight. `Alt text` is `εναλλακτικό κείμενο`.

The first pass covers 2,758 priority strings, including all required
Lite/offline strings and the additional login/search work order. It is partial
coverage for test/canary review, with English fallback for the remainder. Values
were checked through the merge gate for placeholders, markup and declared length
budgets. A native-speaker review and narrow/wide visual walkthrough remain before
production promotion.
