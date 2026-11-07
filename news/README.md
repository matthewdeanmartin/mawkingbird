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
3. Deploy, then open https://mawkingbird.com/news/, sign in (top right) as
   `@mawkingbird@mastodon.social`, and choose **Publish posts** in the account
   menu. Edit the prefilled toot if you like and press **Publish**. Comments
   work at once: the post finds its toot when it loads.
4. Run `make news-link` (or any `make news`) and commit the change. It looks
   up @mawkingbird's public toots and writes each published post's `mastodon:`
   line into its front matter. That saves readers the lookup, and the post keeps
   its comments after the toot drops out of the account's latest 120. The publish
   page's Copy button does the same by hand. To hide a reply, list its URL under
   `hiddenReplies:`.

`tags:` organise the blog. `hashtags:` are only for the announcing toot,
added to the defaults `#mawkingbird #mastodonClient` (`publish.hashtags` in
`fediblog.config.json`).

## Engine version

`vendor/fediblog-<version>.tgz` is the packed engine, and `package-lock.json`
pins its hash. To upgrade, run `npm pack` in the fediblog checkout, replace the
tarball, and run `npm install` here. Once fediblog is on npm, change the
dependency to the published version and delete `vendor/`.

## Page views and security

News counts page views in the app's GoatCounter (`mawkingbird.goatcounter.com`)
with the app's vendored `/vendor/count.js`. It honours the app's analytics
switch (`analytics` in the `mockingbird_client_prefs` storage key) and counts
nothing on canary or test, like the app. Pages carry a Content-Security-Policy
with `script-src 'self'`, as the app's do.

## Theme

`fediblog.config.json` joins `design_system/tokens.css` and `theme.css` into
the site's `theme.css`. `theme.css` repeats the app's base colours, as Help does
in `scripts/help_static/help.css`, and maps them onto the engine's `--fb-*`
properties.
