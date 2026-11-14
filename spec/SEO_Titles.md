# SEO page titles

For indexable Mawkingbird app pages, write the document title as:

`Distinctive title | Target keyword title | Mawkingbird`

The opening should identify this page in words a competing site is unlikely to use verbatim. The middle should name the specific search topic in natural language. Keep both accurate to visible page content, concise, and different across URLs. Avoid repeating the same phrase in both parts or putting Mawkingbird in either part. Do not add a second brand suffix. The title is a preference for search engines, not a guarantee of what they display.

Examples:

| Page | Document title |
| --- | --- |
| `/` | One feed for the places you follow \| Mastodon, Bluesky & RSS reader \| Mawkingbird |
| `/compare/` | The client comparison with RSS in the mix \| Mastodon web clients compared \| Mawkingbird |
| `/for/power-users/` | Tame the endless feed \| Advanced Mastodon client \| Mawkingbird |
| `/tools/` | Small jobs, useful tools \| Free Mastodon and Bluesky tools \| Mawkingbird |
| `/about/` | Why this bird exists \| About the Mastodon and Bluesky app \| Mawkingbird |

The app's `PageTitleStrategy` joins `seoTitleLead`, `seoKeywordTitle`, and the build brand. Route titles without these SEO fields continue to serve as short, readable utility tab titles. The homepage uses `FRONT_PAGE_TAGLINE` and the matching static `<title>` in `src/index.html`. Keep browser routes in `app.routes.ts` and prerender routes in `main.server.ts` identical. For sitemap pages generated from registries, keep their title copy and route metadata in sync. Preserve each translated page's language and script; do not insert an English keyword phrase into a translated title.

Before finishing a title change, compare the sitemap URLs with the rendered `<title>`, `og:title`, visible heading, and canonical URL. Look for duplicate titles, extra pipes, repeated brand names, excessively long titles, and phrasing that claims a feature the page does not deliver. Run the SEO build and browser checks listed in `ui/docs/seo.md`.

Help and News are separate publishing surfaces; this guide covers app pages in `/sitemap.xml`.
