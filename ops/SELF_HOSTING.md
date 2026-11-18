# Run your own copy of Mawkingbird

Mawkingbird is a static web app. It is a folder of HTML, JavaScript and CSS
that runs in the reader's browser and talks directly to Mastodon, Bluesky and
other services. You can publish a copy anywhere that serves static files: on
GitHub Pages from a fork, on your own server, with or without a domain name.

`https://mawkingbird.com/` is the maintainer's copy. It is deployed with a
separate runbook, [DEPLOY.md](DEPLOY.md), which uses the maintainer's GitHub
environment, Cloudflare account and domain. You don't need any of that, and
nothing in this guide touches it.

## What your copy does and doesn't include

Works the same in your copy:

- Signing in to Mastodon and compatible servers. The app registers itself with
  each server the first time someone signs in, using your copy's address, so
  there is nothing to configure.
- Reading, posting, drafts, Blog mode, RSS, video and everything else that
  runs in the browser. Settings and drafts live in each reader's browser.
- Signing in to Bluesky with an app password. Bluesky's OAuth sign-in also
  works once you publish its metadata file (see the build steps).

Belongs to mawkingbird.com and is off in your copy automatically, by
hostname. No configuration is needed:

- **Mawkingbird Plus** and the account, profile-sync and supporter services
  behind it.
- **The Mawkingbird CORS proxy** (`cors.mawkingbird.com`). It refuses
  requests from other sites, and the app doesn't offer it, probe it or call it
  there.
- **Video feeds** (YouTube channel subscriptions), which read YouTube through
  that proxy. The Video menu still works for videos posted on the fediverse.
- **Analytics.** Page views are counted only on mawkingbird.com (and on
  `localhost`, for development).

Needs your own registration if you want it:

- **Dropbox:** the bundled app key is registered to mawkingbird.com. Register a
  Dropbox app for your address and put its key in `dropboxAppKey` in
  `ui/src/environments/environment.mockingbird.ts`, or leave the connector
  unused.
- **Blogger** is off unless `bloggerClientId` is set in the same file (readers
  can also bring their own client id).

Points at mawkingbird.com unless you change it:

- Copied post links (`DEEP_LINK_ORIGIN` in `ui/src/app/posts/copy-link/deep-links.ts`)
  and invite links (`MAWKINGBIRD_URL` in `ui/src/app/accounts/invites/invite-templates.ts`).
- The canonical and social-card tags in `ui/src/index.html`. Change them if you
  want search engines and link previews to use your address.

## The CORS proxy question

Some features read sites that don't allow browsers to fetch them directly:
most RSS feeds, article expansion, link shorteners and a few connectors. Those
need a CORS proxy. In your copy, readers choose one in **Settings →
Connections → CORS proxy**: a third-party public proxy (CorsProxy.io is listed
by default; others can be switched on under **Settings → Feature flags**), or
**Your own proxy** with a URL template for a proxy they run.

This project doesn't provide proxy code for self-hosting. A proxy that fetches
arbitrary addresses for strangers is easy to abuse and needs real security
work, and supporting that isn't something the maintainer can take on. If you
run one, it's yours to secure. Everything that doesn't need a proxy works
without one.

## Build

You need Node 22 or newer and Make (Git Bash on Windows).

```bash
cd ui && npm ci && cd ..
make mockingbird MOCKINGBIRD_BASE_HREF=/
```

The site is written to `ui/dist-mockingbird/browser`. Set
`MOCKINGBIRD_BASE_HREF` to the path your copy will be served from, with
slashes at both ends: `/` for the root of a domain, `/mawkingbird/` for a
subfolder.

Leave `MOCKINGBIRD_SEO` off (the default). It prerenders mawkingbird.com's
public pages, help site and news for search engines, all pointing at
mawkingbird.com.

For Bluesky OAuth sign-in, stamp the metadata file with your copy's public
HTTPS address (ending in `/`):

```bash
node ui/scripts/write-bluesky-oauth-metadata.mjs ui/dist-mockingbird/browser https://example.org/mawkingbird/
```

Without HTTPS (for example on a home network or `localhost`), skip this;
Bluesky sign-in with an app password still works.

## Option A: GitHub Pages from a fork

Your copy will be at `https://<you>.github.io/<repo>/`.

1. **Fork the repository.** The workflows in `.github/workflows` deploy
   mawkingbird.com. They publish nothing unless the repository variable
   `MAWKINGBIRD_PUBLISH_ENABLED` is `true`, so leave it unset. The build and
   test workflows still run on your pushes; disable Actions in your fork if you
   don't want them.
2. **Build** with your repository's path, and stamp the Bluesky metadata:

   ```bash
   make mockingbird MOCKINGBIRD_BASE_HREF=/<repo>/
   node ui/scripts/write-bluesky-oauth-metadata.mjs ui/dist-mockingbird/browser https://<you>.github.io/<repo>/
   ```

3. **Add the 404 fallback.** GitHub Pages serves a single `404.html`, and the
   app uses it to open deep links such as `/<repo>/accounts/123`. Copy the
   bundled shim and point it at your path:

   ```bash
   sed "s#var SITE_BASE = '/';#var SITE_BASE = '/<repo>/';#" \
     ui/dist-mockingbird/browser/404-subpath-redirect.html \
     > ui/dist-mockingbird/browser/404.html
   touch ui/dist-mockingbird/browser/.nojekyll
   ```

4. **Publish the folder to a `gh-pages` branch.** A separate worktree keeps it
   out of your source branch (Git 2.42 or newer for `--orphan`):

   ```bash
   git worktree add --orphan -b gh-pages ../site   # first time only
   cp -r ui/dist-mockingbird/browser/. ../site/
   cd ../site && git add -A && git commit -m "Publish" && git push -u origin gh-pages
   ```

   On later updates, `git worktree add ../site gh-pages` (if the worktree is
   gone), copy, commit and push again.

5. **Turn on Pages:** in your fork, **Settings → Pages → Build and deployment**,
   choose **Deploy from a branch**, branch `gh-pages`, folder `/ (root)`.

If you later add your own domain, rebuild with `MOCKINGBIRD_BASE_HREF=/`, keep
`SITE_BASE` as `/`, and add a `CNAME` file with your domain to the published
folder.

## Option B: any other static host

Copy `ui/dist-mockingbird/browser` to any web server, object store or static
hosting service, with or without your own domain.

The app routes in the browser, so the server must answer unknown paths with
`index.html`. For nginx, serving at the root of a site:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

Serving from a subfolder (built with `MOCKINGBIRD_BASE_HREF=/mawkingbird/`):

```nginx
location /mawkingbird/ {
    try_files $uri $uri/ /mawkingbird/index.html;
}
```

With that rule in place you don't need the `404.html` shim from Option A.

Use HTTPS if anyone but you will use the copy. Bluesky OAuth needs it, and
browsers limit some features (offline install, clipboard) on plain HTTP away
from `localhost`. For a personal copy on `localhost` or a home network, plain
HTTP is fine for Mastodon.

## Next to your own Mastodon instance

If you run a Mastodon server, build a copy for it (sign-in goes straight to
your server): see [MASTODON_INSTANCE.md](MASTODON_INSTANCE.md).

## Keeping your copy up to date

Pull from the upstream repository, rebuild with the same settings, and publish
the folder again. Readers' settings and drafts stay in their browsers across
updates.

## The desktop app

Mawkingbird Native runs on the reader's computer and needs no hosting. It
calls none of mawkingbird.com's services (no Plus, no proxy, no analytics) and
reads feeds, including YouTube channels, directly. Its releases are described
in [NATIVE_RELEASE.md](NATIVE_RELEASE.md).
