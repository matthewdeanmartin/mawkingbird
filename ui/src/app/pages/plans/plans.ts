import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  PLUS_PRICE_USD_PER_YEAR,
  PROXY_RATE_FREE_PER_MINUTE,
  PROXY_RATE_PLUS_PER_MINUTE,
} from '../../plus-benefits';
import { FREE_DAILY_ARTICLES } from '../../providers/article/article-quota';

// i18n pages.plans.title: What each plan includes
// i18n pages.plans.intro.a: Mawkingbird works without an account. Signing in is free, and a subscription is
// i18n pages.plans.intro.price: ${{price}} a year
// i18n pages.plans.intro.b: . This page lists everything that differs between the three, including the exact limits.
// i18n pages.plans.lede: Nothing here takes anything away. Every timeline, feed, list and post works signed out, and anything you have already made stays yours — readable and exportable — whether you subscribe, stop subscribing, or never start.
// i18n pages.plans.reading.title: Reading articles
// i18n pages.plans.reading.intro.a: A link in a feed can always be opened in a new browser tab, on every plan, as many times as you like. That costs nothing and needs nothing from us. What the limit below covers is opening the article
// i18n pages.plans.reading.intro.b: inside Mawkingbird
// i18n pages.plans.reading.intro.c: — pulled in, stripped of navigation and adverts, and laid out to read next to the feed you found it in.
// i18n pages.plans.table.what: What
// i18n pages.plans.table.signedOut: Signed out
// i18n pages.plans.table.signedInFree: Signed in, free
// i18n pages.plans.table.plus: Plus
// i18n pages.plans.reading.row.openTab: Open a link in a new tab
// i18n pages.plans.table.unlimited: Unlimited
// i18n pages.plans.reading.row.readInApp: Read an article inside the app
// i18n pages.plans.perDay: {{count}} a day
// i18n pages.plans.reading.row.reopen: Re-open an article you already read
// i18n pages.plans.table.freeNoCount: Free, does not count
// i18n pages.plans.reading.footnote: The count resets at midnight, by your computer's clock. An article already fetched is kept in this browser and stays free to reopen forever, so re-reading something never costs an expansion.
// i18n pages.plans.connecting.title: Connecting to other sites
// i18n pages.plans.connecting.intro: Feeds, paste sites, link shorteners and blog publishing all involve Mawkingbird fetching something from a site that is not this one. Browsers refuse most of those requests for security reasons, so they pass through a small relay we run. The limit is on how fast you can make those requests, not how many in total.
// i18n pages.plans.connecting.row.requests: Requests through the relay
// i18n pages.plans.perMinute: {{count}} a minute
// i18n pages.plans.connecting.row.countedAgainst: Counted against
// i18n pages.plans.connecting.networkAddress: Your network address
// i18n pages.plans.connecting.yourAccount: Your account
// i18n pages.plans.connecting.footnote1: Signing in does not change this limit — the relay does not ask who you are until you subscribe. What signing in changes is counted per address rather than per account, which matters if several people share a connection.
// i18n pages.plans.connecting.footnote2: To put the number in scale: refreshing a page of feeds is typically one request per feed. The free rate is enough to refresh dozens of feeds at once, several times a minute. You are most likely to notice the ceiling while importing a large subscription file for the first time.
// i18n pages.plans.devices.title: Your things on your other devices
// i18n pages.plans.devices.intro: Everything you set up in Mawkingbird is kept in the browser you set it up in. That is true on every plan and it is why the app works signed out at all. What a subscription adds is a copy kept on your account, so opening Mawkingbird on your phone finds the same setup as your computer.
// i18n pages.plans.devices.row.feeds: Feeds you subscribe to
// i18n pages.plans.devices.thisBrowser: This browser
// i18n pages.plans.devices.everyDevice: Every device you sign in on
// i18n pages.plans.devices.row.lists: Lists you make
// i18n pages.plans.devices.row.accounts: Accounts you trust
// i18n pages.plans.devices.row.settings: Your settings
// i18n pages.plans.devices.row.howMany: How many of each you can have
// i18n pages.plans.devices.row.moveByFile: Move them yourself with a file
// i18n pages.plans.table.yes: Yes
// i18n pages.plans.devices.footnote1: There is no cap on any of these, on any plan — a free list is not a smaller list, it is a list kept somewhere else. Export and import by file works on every plan, so a subscription buys not having to do it by hand, not permission to do it at all.
// i18n pages.plans.devices.footnote2: Lists, feeds and trust are stored separately for each Mastodon account you sign in with, so an alt never inherits your main account's decisions. Settings are shared across the whole Mawkingbird account.
// i18n pages.plans.stop.title: If you stop
// i18n pages.plans.stop.body: A cancelled subscription runs to the end of the year you paid for. After that, the copies on your account stay readable and exportable, and everything in this browser is untouched — the app returns to keeping things locally, which is how it works for everyone who never subscribed.
// i18n pages.plans.backLink: Back to your plan

/**
 * "Plans" — the exhaustive tier reference.
 *
 * ## Why this page exists
 *
 * The Plus pitch used to carry its own numbers: "60 requests a minute, counted
 * per address", "2 fetched articles each day". Both are true and neither helps
 * anyone decide. A reader cannot tell whether 60 requests a minute is generous
 * or stingy without knowing how many requests reading a feed costs, and nobody
 * outside this repo knows that. Printed on a badge with no room to explain, a
 * number like that is worse than no number: it looks like a limit being
 * imposed, and the reader has no way to judge it.
 *
 * So the pitch dropped to two rows of plain outcomes (`plus-benefits.ts`) and
 * the numbers moved here, where there is room to say what they mean. This is
 * the page for someone who has already decided they care.
 *
 * ## Why it is not a virtual tweet
 *
 * Design, Funding and Credits render through `StatusCard` as synthetic posts,
 * and that is the right treatment for prose. This page is a comparison table
 * across three tiers, and StatusCard sanitises to Mastodon post markup — the
 * Funding page already notes that nested lists do not survive the trip, and a
 * `<table>` would not either. So it is a plain page using the global
 * `.page-head` style, the same shape as the other tabular pages.
 *
 * ## Why the numbers are imported, not typed
 *
 * Every number here is the constant the running code enforces. A reference page
 * that drifts from the gate it documents is the exact failure `plus-benefits.ts`
 * was written to end, and it would fail worse here — this is the page people
 * will quote back.
 */
@Component({
  selector: 'app-plans',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './plans.html',
  styleUrl: './plans.css',
})
export class Plans {
  protected readonly priceUsd = PLUS_PRICE_USD_PER_YEAR;
  protected readonly freeArticles = FREE_DAILY_ARTICLES;
  protected readonly proxyFreeRate = PROXY_RATE_FREE_PER_MINUTE;
  protected readonly proxyPlusRate = PROXY_RATE_PLUS_PER_MINUTE;
}
