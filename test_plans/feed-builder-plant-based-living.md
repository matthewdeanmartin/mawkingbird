# Plant Based Living integration checks

Approved editions:

- English: `/plant-based-living-on-mastodon/` (13 people, 3 live tags).
- German: `/de/pflanzlich-leben-auf-mastodon/` (11 people, 3 live tags and one future tag).

## Signed out

1. Open both pages from `/communities/`. Check native headings, introductions,
   positive-outreach FAQ, people, tags and the veganism.social link.
2. Switch between English and German. Only these approved editions should be
   offered; check canonical and hreflang URLs, including trailing slashes.
3. Verify English offers Vegetarian, PlantBased and VeganFood; German offers
   Vegetarisch, Vegetarian, PlantBased and future Pflanzenbasiert. Held broad
   tags must not reappear.
4. Open Preview and shuffle. Check that public posts load and the page explains
   selection without promising that all future posts will be non-graphic.
5. Check narrow mobile and desktop widths, keyboard navigation, and the static
   page with JavaScript disabled.

## Signed in (manual, use a test account)

1. Sign in from each edition and check the return path and language.
2. Select a small subset of people and tags; follow selected items. Verify only
   that subset is followed and the existing follow state is shown correctly.
3. Convert the selected people to a list. Check the list name is Plant Based
   Living in English or Pflanzlich leben in German.
4. On the German page, follow the future-tag workflow and check its composer
   hint pairs Pflanzenbasiert with PlantBased.
5. Check Preview and Flooding tabs retain the selection and language.

Automated checks cover topic rendering, route registration, approved-only
imports, SEO metadata, static/client rendering and mobile overflow. They do not
perform authenticated follows or certify external posts and media.
