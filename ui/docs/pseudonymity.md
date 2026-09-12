# Pseudonymity

Advanced → Pseudonymity applies to the current social account in this browser.
Enabling the mode turns on the posting reminder and defaults link and photo
cleaning on. Each control can be disabled independently. Existing opt-outs are
preserved when the mode is turned off and back on; the posting reminder is
turned back on. Ordinary accounts keep their existing behavior.

- **Private follows:** use a profile's menu to add public posts to Home without
  a network follow. Up to 50 combined Mastodon and Bluesky accounts.
- **Private likes:** use a post's `…` menu to save a browser-only reference.
  They never change the normal like button or public counts. Settings lists
  up to 200 references, with short text excerpts, links, and removal controls.
- **Private lists:** existing browser-local lists remain available. PA mode
  prevents copying these lists to Mawkingbird Plus.

These collections and PA settings are isolated by social account and excluded
from settings sync and shareable exports. Clearing the account's local data
removes them. There is no Plus sync for private follows or private likes.

## Outgoing links

When enabled, known tracking query parameters are removed at the Mastodon and
Bluesky posting endpoints, including Mastodon edits. Bluesky UTF-8 rich-text
offsets are adjusted with the text. Parameters include `utm_*`, `fbclid`,
`gclid`, `msclkid`, and other explicitly recognized click identifiers.

Unknown parameters, URL fragments, signed links, and short links are preserved.
The cleaner does not fetch links, follow redirects, or promise to identify
every identifier. Review URLs and post content before posting.

## New photo uploads

While photo cleaning is enabled, still JPEG and PNG uploads are decoded and
re-encoded in the browser before the Mastodon or Bluesky upload request. The
fresh file does not copy source EXIF, GPS, embedded text, or the original
filename. JPEG orientation is applied to pixels; PNG transparency is retained.
JPEG quality and colors can change. Browser-generated encoding metadata may
remain. The limit is 20 MB and 40 megapixels; Bluesky's upload size limit also
applies to the resulting file.

Unsupported formats, animated PNG, decoding/encoding failures, and account
changes during cleaning stop the upload. There is no original-file fallback.
GIF, WebP, SVG, audio, video, and documents are not supported by this cleaner.
Original files are unchanged. Previously uploaded attachments are unchanged;
remove them and attach them again after enabling cleaning.

This does not remove identifying information from visible pixels, alt text,
writing style, posting history, or the server's records. Mastodon may attach
the OAuth application's identity to posts; this client cannot guarantee its
removal. No screenshot feature, automatic deletion, or forced scheduling is
included.
