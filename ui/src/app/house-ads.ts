/**
 * House ads shown in the right rail.
 *
 * This file IS the ad inventory — to add, remove or reword an ad, edit the
 * array below and rebuild. No other code changes needed.
 *
 * The inventory covers two things now: our own projects, and endorsements of
 * other people's clients and services worth knowing about ({@link HouseAd.kind}).
 * None of it is paid placement either way, but the card labels the difference so
 * a reader is never left guessing whether "Phanpy" is something of ours.
 *
 * Only {@link HOUSE_ADS_SHOWN} of them are on screen at a time, they rotate on
 * a timer, each can be switched off for good in Settings → Ads, and each can be
 * dismissed for the rest of the page's life. All of that behaviour lives in
 * `HouseAdStore`; this file stays inert data so the inventory can be reworded
 * without reading any of it.
 *
 * The donate links in the rail's Fediverse card are deliberately NOT ads. They
 * ask for money for someone else's server instead of promoting something of
 * ours, they are always shown, and none of the machinery here governs them.
 */
export interface HouseAd {
  /**
   * Stable identity, used for the click tally and the off switch. Do not reuse
   * one for different copy — the stored click count would carry over and start
   * describing an ad nobody ever saw.
   */
  id: string;
  /** Headline, shown bold. Lead with an emoji if you want one. */
  title: string;
  /** One or two short sentences of body copy. */
  text: string;
  /** Where clicking the ad goes (opened in a new tab). */
  url: string;
  /** Call-to-action line, e.g. "Get it on GitHub ↗". */
  cta: string;
  /**
   * Whose thing this is. `'house'` (the default when omitted) is one of our own
   * projects; `'endorsement'` is someone else's client or service that we're
   * recommending, badged as such on the card. Not a paid-placement marker —
   * nothing here is paid, an endorsement least of all.
   */
  kind?: 'house' | 'endorsement';
}

/**
 * How many ads are on screen at once, however many the inventory holds.
 *
 * Note that this is the dilution knob: every entry added to the inventory below
 * cuts each ad's share of screen time, since the visible pair is drawn from the
 * whole list. At 8 entries an ad shows about a quarter of the time.
 */
export const HOUSE_ADS_SHOWN = 2;

export const HOUSE_ADS: HouseAd[] = [
  {
    id: 'invite-people-off-twitter',
    title: '📣 Invite people to leave Twitter',
    text: 'Pick an invitation, make it yours, and send it wherever your friends still post.',
    url: 'https://mawkingbird.com/invites?mastodon.social',
    cta: 'Build an invitation ↗',
  },
  {
    id: 'mastodon-mock',
    title: '🦣 Mastodon Mock',
    text: 'Mock Mastodon server, mock the REST API for testing. MIT',
    url: 'https://github.com/matthewdeanmartin/mastodon_mock/',
    cta: 'Get it on GitHub ↗',
  },
  {
    id: 'mimb-lite',
    title: '🪶 MIMB lite',
    text: 'The blog-style Mastodon reader, right in your browser.',
    url: 'https://matthewdeanmartin.github.io/mastodon_is_my_blog/mimb_lite/index.html',
    cta: 'Open MIMB lite ↗',
  },
  {
    id: 'youtuber-finder',
    title: '📺 YouTuber Finder',
    text: 'Find people that are big on YouTube and Mastodon.',
    url: 'https://matthewdeanmartin.github.io/youtuberfinder/',
    cta: 'Try YouTuber Finder ↗',
  },
  {
    id: 'phanpy',
    title: '🌿 Phanpy',
    text: 'A beautiful, zen Mastodon client — minimal visible clutter.',
    url: 'https://phanpy.social/',
    cta: 'Try Phanpy ↗',
    kind: 'endorsement',
  },
  {
    id: 'elk-zone',
    title: '🦌 Elk',
    text: "A Mastodon client for people who want post-2019 Twitter's UI.",
    url: 'https://elk.zone/',
    cta: 'Open Elk ↗',
    kind: 'endorsement',
  },
  {
    id: 'pinafore',
    title: '🥞 Pinafore',
    text: 'A fast, lightweight Mastodon client that works well on slow connections.',
    url: 'https://pinafore.social/',
    cta: 'Open Pinafore ↗',
    kind: 'endorsement',
  },
  {
    id: 'nicolium',
    title: '💠 Nicolium',
    text: 'Another take on the Mastodon web client, worth a look.',
    url: 'https://nicolium.app/',
    cta: 'Open Nicolium ↗',
    kind: 'endorsement',
  },
  {
    id: 'mastui',
    title: '⌨️ Mastui',
    text: 'Mastodon in your terminal.',
    url: 'https://pypi.org/project/mastui/',
    cta: 'Get Mastui ↗',
    kind: 'endorsement',
  },
  {
    id: 'bluesky',
    title: '🦋 Bluesky',
    text: 'Some of your old friends are there.',
    url: 'https://bsky.app/',
    cta: 'Open Bluesky ↗',
    kind: 'endorsement',
  },
  {
    id: 'raindrop',
    title: '💧 Raindrop',
    text: "More features than Mastodon's bookmarks.",
    url: 'https://raindrop.io/',
    cta: 'Try Raindrop ↗',
    kind: 'endorsement',
  },
];
