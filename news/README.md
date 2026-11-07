# Mawkingbird News

The static blog at https://mawkingbird.com/news/. It is built by
[fediblog](https://www.npmjs.com/package/fediblog), a separate MIT-licensed
Angular engine whose comments are Mastodon replies. The design is in
`spec/news-blog-engine.md`.

## Write a post

1. Add `posts/YYYY-MM-DD-slug.md` with `title`, `description`, `date` and
   `tags` in the front matter (see an existing post). Set `draft: true` until
   it is ready.
2. Preview it: `make news NEWS_OUT=.news-site` from the repository root, then
   serve `.news-site` at `/news/`. Add `NEWS_ARGS=--drafts` to include drafts.
3. Publish (production deploy), then toot the post from
   `@mawkingbird@mastodon.social`.
4. Add the toot's URL as `mastodon:` in the front matter and deploy again.
   Replies to that toot are now the post's comments. To hide a reply, list its
   URL under `hiddenReplies:`.

## Engine version

`vendor/fediblog-<version>.tgz` is the packed engine, and `package-lock.json`
pins its hash. To upgrade, run `npm pack` in the fediblog checkout, replace the
tarball, and run `npm install` here. Once fediblog is on npm, change the
dependency to the published version and delete `vendor/`.

## Theme

`fediblog.config.json` joins `design_system/tokens.css` and `theme.css` into
the site's `theme.css`. `theme.css` repeats the app's base colours, as Help does
in `scripts/help_static/help.css`, and maps them onto the engine's `--fb-*`
properties.
