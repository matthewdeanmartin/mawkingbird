import { FeatureFlagId } from './feature-flags';
import { PlusFeature } from './providers/account/plus-features';

/**
 * What a Mawkingbird Plus subscription actually buys, as data.
 *
 * ## Why this exists
 *
 * The Plus page used to describe the subscription in two hand-written
 * paragraphs, and both of them were wrong. They said Plus was "patronage, not a
 * feature unlock" and that "the app, the proxy, and everything in it work
 * exactly the same whether you pay or not" — while the profile service was
 * answering 402 to unsubscribed accounts writing lists, feeds, trust and
 * settings sync, and the same page rendered a read-only banner saying so a few
 * hundred pixels further down. Prose cannot be kept honest by review; it drifts
 * the moment a gate is added anywhere else in the app.
 *
 * So the page renders this table instead. Adding a gate without adding a row
 * here is still possible, but the rows that exist can no longer contradict the
 * app, and the rate limits are stated once rather than retyped per screen.
 *
 * ## What links to what
 *
 * - `feature` ties a row to the {@link PlusFeature} the account can switch on,
 *   so a row cannot describe a capability the settings page has no toggle for.
 *   Optional, and now unused: both surviving rows describe outcomes delivered by
 *   several switches at once. It stays because a future single-switch benefit
 *   should be able to declare itself rather than reintroducing prose.
 * - `flag` ties a row to the {@link FeatureFlagId} that can remove it from the
 *   build entirely. A row whose flag is off must not be advertised — selling
 *   something the running build cannot do is the same class of lie the prose
 *   was telling.
 *
 * ## Where the detail went
 *
 * These rows deliberately carry no numbers. See `pages/plans` for the exhaustive
 * anonymous / signed-in / Plus breakdown, which is where a reader who wants to
 * know whether 60 requests a minute is a lot can find out. The constants below
 * are still exported from here because they are the single source both that page
 * and the proxy catalog read.
 */

/**
 * Requests per minute the shared proxy allows, by tier.
 *
 * Named here and imported by the proxy catalog rather than typed into each
 * description, because these two numbers appeared in five places and the copy
 * that quoted them was the copy that went stale.
 */
export const PROXY_RATE_FREE_PER_MINUTE = 60;
export const PROXY_RATE_PLUS_PER_MINUTE = 300;

/** The subscription price, in whole US dollars per year. */
export const PLUS_PRICE_USD_PER_YEAR = 30;

export interface PlusBenefit {
  /** Stable id, for tests and for tracking a row across copy edits. */
  id: string;
  /** Row heading. A capability, not a slogan. */
  label: string;
  /** What a free account gets. Written to be true, not to be discouraging. */
  free: string;
  /** What a subscription gets. */
  plus: string;
  /**
   * The account-level switch this row corresponds to, when there is one.
   *
   * Absent for the proxy rate limit, which is not a feature you turn on — it is
   * the tier the proxy applies to whatever you were doing anyway.
   */
  feature?: PlusFeature;
  /** The flag that can remove this capability from the build. */
  flag?: FeatureFlagId;
}

/**
 * The rows, in the order the page shows them.
 *
 * ## Why there are two rows and not six
 *
 * There used to be six: a proxy rate limit, article expansions, and then lists,
 * feeds, trust and settings — four rows that were the same sentence with the
 * noun swapped. That list had two problems and both were fatal to the pitch.
 *
 * It was written from the implementation outward, so it led with "CORS proxy
 * rate limit" and "article reader expansions" — a phrase no reader outside this
 * repo can parse, and a mechanism nobody subscribes to. Nobody pays a social
 * client to add headers to its API calls.
 *
 * And it grew. Every domain object that gained sync earned a row, so the table
 * got longer as the product got better, which is exactly backwards: the reader
 * has to work harder to learn something that has not changed. "Your things are
 * the same on every device" is one promise whether it covers four collections
 * or forty.
 *
 * So the rows are the two things a subscriber actually notices, named as
 * outcomes. The specifics — which collections sync, what the numbers are, how
 * anonymous differs from signed-in-free — live on `/plans`, linked from the
 * table. A pitch that fits in a popover and a reference that holds every number
 * are different documents; this file is the pitch.
 *
 * ## Why the article row is not "we can reach that page"
 *
 * Because the reader can already reach it. Opening the link in a new tab is
 * free, works today, and needs nothing from us. Claiming access as the benefit
 * describes a limitation of the app rather than a feature of the subscription.
 *
 * What Plus actually buys is not having to leave: the article opens here, laid
 * out to read, in the list you were already in. That is the sentence.
 */
export const PLUS_BENEFITS: readonly PlusBenefit[] = [
  {
    id: 'read-here',
    label: 'Read articles without leaving',
    free: 'A couple of full articles a day. Links always open in a new tab for free.',
    plus: 'Open as many as you like, laid out to read, without losing your place.',
    // Deliberately unflagged, despite fetching an article going through the
    // proxy. The limit this row describes is enforced by `ArticleQuota` in this
    // browser against the subscription, not by the proxy tier — so it holds on a
    // build where `proxy-mawkingbird-plus` is off (which is every production
    // build today, that flag being `defaultState: 'test'`). Flagging it would
    // silently delete the row from the pitch everywhere it currently ships.
  },
  {
    id: 'same-everywhere',
    label: 'The same on your phone and your PC',
    free: 'Everything you set up stays on this computer. Save a file to move it yourself.',
    plus: 'Your feeds, lists and settings follow you to every device you sign in on.',
    // No `feature`: this row is the promise, and the promise is kept by four
    // separate switches (`listsSync`, `feedsSync`, `trustSync`, and settings
    // sync via `ProfileSyncRecord`). Naming one of them here would tie the row
    // to an arbitrary quarter of what it describes.
  },
];

/**
 * The rows worth showing in this build.
 *
 * A row with no flag is always shown. A row with one is shown only when that
 * flag is on, so a build without the Plus proxy does not advertise its rate
 * limit.
 */
export function visiblePlusBenefits(isFlagOn: (flag: FeatureFlagId) => boolean): PlusBenefit[] {
  return PLUS_BENEFITS.filter((benefit) => !benefit.flag || isFlagOn(benefit.flag));
}
