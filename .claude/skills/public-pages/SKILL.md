---
name: public-pages
description: Add or change a public, crawlable Mawkingbird page (features, audience, compare, tool pages, /communities/ Feed Builder, YouTubers/podcasts, help, news, language pages) or its title, description, sitemap, canonical or social-card metadata.
---

# Public pages and SEO

Reference: `ops/engineering/seo.md` (sections per page family, "Adding a language",
and titles/structured data/sitemap dates).

## Keep four things in sync

Client route, server (prerender) route, sitemap entry, and the SEO checks. A page that
has only some of these is broken for crawlers or for readers.

## Copy

- Site-wide copy, titles and meta descriptions lead with the client: "browser client
  for Mastodon and Bluesky", then a few features. A tool page can lead with its tool.
- "Twitter", never "X" (`x.com` hostnames in code stay).
- No pages that help people quit, delete accounts, move servers or mass-unfollow.
- Public pages in other languages use the register of that language's app dictionary.
  Their slugs follow seo.md (words in the language; ja/ko/zh-Hant keep English slugs).
- Feed Builder design and consent discussion is private (mawkingbird_starters). Public
  pages get the pages and mechanics only.

## Checks

Light: `python -B -X utf8 ui/scripts/audit_deep_links.py`, specs for the page family
(e.g. `audience-content.spec.ts`). Heavy, so ask first: `make test-seo`, then
`npm run test:seo:browser`. Usually you leave these to GitHub Actions at a stop point.

Publishing: read `ops/DEPLOY.md` first. Keep origins, OAuth redirects and storage keys
stable. Production base href is `/`.
