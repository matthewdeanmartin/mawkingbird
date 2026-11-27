# addons.mozilla.org listing (draft, not submitted)

Owner rule: nothing goes to the store before weeks of dogfooding. Submit with
`web-ext sign --channel listed` (or the AMO upload page) only after that.

## Name

Mawkingbird

## Summary (≤ 250 characters)

Share the page you're reading to Mastodon and Bluesky, keep a sidebar about it,
and let Mawkingbird read feeds, articles and YouTube from your own computer, with
no proxy and no account of ours.

## Description

Mawkingbird is a client for Mastodon, Bluesky and RSS. This add-on brings it to
the page you're on:

- **Share** the page, or quote the text you selected, into a new post.
- **The sidebar** is about the page beside it: write about it, see your own posts
  about it, and see who else is talking about it.
- **Open in Mawkingbird**: Mastodon, Bluesky and Twitter posts and profiles open
  in your own Mawkingbird view, where Follow and Reply work.
- **Subscribe** to a site's feed, or find its author on the fediverse.
- **YouTube**: on mawkingbird.com, search YouTube, browse whole channels and read
  video details and comments, read anonymously from your computer, no Plus needed.
- **Feeds and articles** that websites block from browsers are read from your
  computer instead of through a proxy, for sites you allow.

Mawkingbird asks before reading any site, one at a time, or you can let it read
any public site (off by default). It never reads your home network, never sends
your cookies, and keeps no data of its own.

Source code: https://github.com/matthewdeanmartin/mawkingbird (extension/).
Licence: MIT.

## Categories

Social & Communication; Feeds, News & Blogging.

## Contribute link

The Mawkingbird supporter page (owner to confirm the URL).

## Screenshots to capture (1280×800)

1. The sidebar beside a news article: Write about this page, your post, others' posts.
2. The toolbar popup on a blog: Share, Feeds, Author on the fediverse.
3. The share dialog with the composer filled in.
4. Watch on mawkingbird.com with YouTube details and comments.
5. The "Let Mawkingbird read blog.example?" window.

## Data collection declaration: owner decision before submitting

The manifest says `data_collection_permissions: { required: ["none"] }`. Review
against Mozilla's definitions before submitting:

- The add-on sends nothing to its author and has no server.
- Pages you share go to mawkingbird.com's share page in your browser (in its
  address, because you asked to share them). Pages open while the sidebar is
  open are passed to the panel by `postMessage` and never appear in a URL, so
  mawkingbird.com's host doesn't see them. (0.6.0's `#fragment` approach did
  reach the host through GitHub Pages' 404 redirect; fixed in 0.7.0.)
- The sidebar's "You posted about this page" searches **your own Mastodon
  server** for the page's address, and "Posts about this page" asks your server
  too. Mozilla may count that as transmitting browsing activity. If so, declare
  `browsingActivity` (required, or optional with an in-sidebar consent) rather
  than `none`.
