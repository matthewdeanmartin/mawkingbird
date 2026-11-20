# Museum

Use Node 22 or newer. Install the UI dependencies once with `cd ../ui && npm ci`.
Then run `make serve` from this directory and open <http://127.0.0.1:4177>.
The local server reads the current `ui/` source when you load or refresh the
page. It does not write a copy of the catalogue. Use the Eyebrows filter for
short labels, Strong words to scan absolute wording, Yapping to browse long i18n strings by length, and Review prompts for possible overstatements. A match is a
question for a human reviewer, not a finding about the product or its law.

The catalogue includes English `i18n` declarations, visible text and selected
attributes in default HTML and inline Angular templates, English copy in TypeScript objects
that identify their language, and the public About/Funding/Credits essays.
Other dynamic strings assembled at runtime may not be represented. Each card gives its source path and line so edits can be
made at the actual source. `ui/public/i18n/en.json` is generated; edit the
nearby `i18n` comment instead.

## Redraft with OpenRouter

Click **Redraft** on a snippet. Enter your OpenRouter API key in the dialog, or
start the server with `OPENROUTER_API_KEY` set. The key is never written to
disk by the museum. Three editable model IDs are crossed with three editable
improvement instructions: each run makes nine OpenRouter requests. Choose one
to five alternatives per pair before generating. The dialog shows the request
count and maximum number of drafts. OpenRouter and the chosen model providers
receive the snippet and may charge your account.

**Approve and save** is available for i18n source strings and simple HTML
snippets that have no separate translated template. For i18n, it writes the
selected wording to the source comment and `ui/public/i18n/en.json`, then
removes that key from non-English locale JSON files so those languages fall
back to the updated English until they are translated again. Approval refuses
stale source files, changed placeholders and changed HTML tags. For plain
template snippets with translated siblings, TypeScript copy objects and essays,
copy the draft and edit the source manually; these may have separate
translations or markup.
