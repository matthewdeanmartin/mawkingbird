import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';

/**
 * A link list of people-finding directories that live on other sites.
 *
 * Named for what it is rather than what it is for: "Find people" was the same
 * promise the Find Friends hub makes, and having both meant the prominent
 * "who to follow" links landed on whichever one happened to be wired up. This
 * is one row on that hub now — the offsite half, where every destination opens
 * in a new tab and nothing can be followed without leaving.
 */
// i18n pages.offsiteDirectories.title: Offsite directories
// i18n pages.offsiteDirectories.intro.a: Other people have built good ways to find fediverse accounts. These all live on other sites and open in a new tab — bring handles back here and paste them into
// i18n pages.offsiteDirectories.searchLink: search
// i18n pages.offsiteDirectories.intro.b: to follow, or
// i18n pages.offsiteDirectories.importLink: import a follow list
// i18n pages.offsiteDirectories.intro.c: in Settings.
// i18n pages.offsiteDirectories.browseTitle: Browse directories
// i18n pages.offsiteDirectories.thisServer.name: This server's directory
// i18n pages.offsiteDirectories.thisServer.desc: Members who opted into discovery — browse by recently active or recently joined.
// i18n pages.offsiteDirectories.fediDirectory.name: fedi.directory ↗
// i18n pages.offsiteDirectories.fediDirectory.desc: Hand-curated, interesting accounts by topic.
// i18n pages.offsiteDirectories.fediverseInfo.name: fediverse.info ↗
// i18n pages.offsiteDirectories.fediverseInfo.desc: Opt-in people directory, browsable by hashtag.
// i18n pages.offsiteDirectories.followgraph.name: Followgraph ↗
// i18n pages.offsiteDirectories.followgraph.desc: Finds people your friends follow but you don't — the highest-yield source once you already follow a few of the right people.
// i18n pages.offsiteDirectories.fediDevs.name: FediDevs ↗
// i18n pages.offsiteDirectories.fediDevs.desc: Developer-centric: people who build things, by language and topic.
// i18n pages.offsiteDirectories.youtuberFinder.name: YouTuber Finder ↗
// i18n pages.offsiteDirectories.youtuberFinder.desc: YouTubers who also post on the fediverse.
// i18n pages.offsiteDirectories.trunk.name: Trunk ↗
// i18n pages.offsiteDirectories.trunk.desc: Opt-in lists by interest, maintained by volunteers.
// i18n pages.offsiteDirectories.cantFindTitle: Can’t find them?
// i18n pages.offsiteDirectories.cantFindDesc: Maybe you need to invite them to join Mastodon.
// i18n pages.offsiteDirectories.alsoTry.a: Also try
// i18n pages.offsiteDirectories.alsoTry.b: — paste any handle or profile URL to find an account — and check profiles for a “featured” section: accounts they vouch for.
@Component({
  selector: 'app-offsite-directories',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './offsite-directories.html',
  styleUrl: './offsite-directories.css',
})
export class OffsiteDirectories {
  /** True when hosted inside another page (e.g. search's empty state): no page title. */
  readonly embedded = input(false);
}
