# Run Mawkingbird next to your Mastodon instance

If you run your own Mastodon server (a single-user instance, say), you can
serve a copy of Mawkingbird alongside it, built for that server. Mastodon keeps
running exactly as it does now: federation, its own web interface, sign-up,
settings and admin pages are untouched. Mawkingbird is a second front door to
the same accounts.

This guide builds on [SELF_HOSTING.md](SELF_HOSTING.md), which explains what
any self-hosted copy includes and leaves out (no Plus, no Mawkingbird proxy,
no analytics).

## Pick an address

| Layout                            | Address                               | Notes                                                                                                                |
| --------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Subdomain** (simplest)          | `https://app.example.social/`         | Its own nginx `server` block and certificate. Nothing in Mastodon's config changes.                                  |
| **Path on the instance's domain** | `https://example.social/mawkingbird/` | One `location` block added to Mastodon's nginx config. `/mawkingbird/` is not a Mastodon route, so nothing collides. |

Don't serve Mawkingbird at the root (`/`) of your instance's domain. Mastodon
needs most of those paths for federation, sign-in, settings and admin; see
`spec/mastodon-instance-ui.md` for what taking over the root would involve.

## Build for your server

Set your instance as the build's **home server**, and the base path for the
layout you picked:

```bash
cd ui && npm ci && cd ..

# Subdomain
make mockingbird MOCKINGBIRD_HOME_SERVER=https://example.social MOCKINGBIRD_BASE_HREF=/

# Path on the instance's domain
make mockingbird MOCKINGBIRD_HOME_SERVER=https://example.social MOCKINGBIRD_BASE_HREF=/mawkingbird/
```

With a home server, the build treats your instance as its own:

- **Sign-in** goes to your instance directly: the reader is not asked to pick
  a server. "Use another server" remains one click away for anyone who needs
  it.
- **Browsing without signing in** reads your instance's public posts.
- The fallbacks that would otherwise use mastodon.social use your instance.

The home server is fixed at build time and recorded in the built `index.html`
(`<meta name="mawkingbird:home-server">`). To change it, rebuild.

Optionally, for Bluesky OAuth sign-in, stamp the metadata with the address the
copy is served from (HTTPS, ending in `/`):

```bash
node ui/scripts/write-bluesky-oauth-metadata.mjs ui/dist-mockingbird/browser https://app.example.social/
```

The site is in `ui/dist-mockingbird/browser`. Copy it to the server, for
example to `/var/www/mawkingbird/`. Keep it out of Mastodon's own
`/home/mastodon/live/public`, which belongs to Mastodon's checkout and is
replaced on upgrades.

## nginx: subdomain

A new `server` block beside Mastodon's. Reuse the TLS settings from Mastodon's
block (or run `certbot --nginx -d app.example.social`).

```nginx
server {
  listen 443 ssl;
  listen [::]:443 ssl;
  server_name app.example.social;

  # ssl_certificate / ssl_certificate_key: as for your Mastodon server block.

  root /var/www/mawkingbird;

  location / {
    try_files $uri $uri/ /index.html;
  }

  # Hashed bundles never change; index.html must be re-read after an update.
  location ~* \.(?:js|css|woff2?|png|svg|webp)$ {
    add_header Cache-Control "public, max-age=31536000, immutable";
    try_files $uri =404;
  }
  location = /index.html {
    add_header Cache-Control "no-cache";
  }
}
```

Mastodon's API (`/api/*`) and token endpoints accept requests from any origin,
so a subdomain needs no Mastodon configuration.

## nginx: path on the instance's domain

Built with `MOCKINGBIRD_BASE_HREF=/mawkingbird/` and copied to
`/var/www/mawkingbird/`, add this inside Mastodon's existing HTTPS `server`
block, **above** its `location / {` block:

```nginx
  location ^~ /mawkingbird/ {
    root /var/www;
    try_files $uri $uri/ /mawkingbird/index.html;
    # Mastodon's sample config sets HSTS per location; keep it here too.
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains";
  }
```

`^~` keeps Mastodon's regular-expression locations from taking these
requests. Then run `nginx -t` and reload.

## Sign-in and accounts

Readers sign in with their Mastodon account through Mastodon's own OAuth page,
the same as any other app. On first sign-in Mawkingbird registers itself as an
application on your instance; it then appears under **Authorized apps** in
Mastodon's settings, where it can be revoked. Mawkingbird never sees a
password.

Mastodon's sign-up, password reset, two-factor setup, profile settings,
filters and admin stay on Mastodon's own pages.

## Updating

Pull the new version, rebuild with the same `MOCKINGBIRD_HOME_SERVER` and
`MOCKINGBIRD_BASE_HREF`, and replace the files. Readers' settings and drafts
are stored in their browsers and survive updates. Mastodon upgrades don't
affect Mawkingbird, and vice versa.
