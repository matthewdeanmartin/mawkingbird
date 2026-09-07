import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Auth } from '../../auth';
import { contactPickerAvailable } from '../settings/import-export/contact-picker';

/**
 * Find Friends: a hub for every route in the app that ends in "…and now you
 * follow someone".
 *
 * Pure navigation, in the same shape as {@link Docs} — a list of rows, each a
 * link with one line saying what it is for. It exists because those routes had
 * spread across the More menu (Starter Kits), Settings (import a follow list),
 * and the search page, with nothing connecting them. Someone new does not know
 * which of those they want; they know they want people to follow.
 *
 * Collapsing them into one entry also bought back a slot in the More menu, which
 * is the practical reason this landed now.
 *
 * Anonymous accounts see a reduced set: importing a follow list and sending
 * invites both need a real account on an instance, so those rows would be dead
 * ends. Search and the people browser work for everyone.
 *
 * ## Ordering
 *
 * Rows are ordered by how well each works for someone who has been here five
 * minutes, and the ones that need prior knowledge sit under an **Advanced**
 * heading. Starter kits lead: they are the only option that needs no name, no
 * typing and no leaving the site. Off-site directories are the clearest case
 * for demotion — following someone found there means reading a handle
 * elsewhere, coming back, and searching for it by hand.
 */
// i18n pages.findFriends.heading: Find Friends
// i18n pages.findFriends.intro: Every way this app can help you find people to follow, in one place.
// i18n pages.findFriends.starterKits.title: Ready-made sets of people
// i18n pages.findFriends.starterKits.desc: Follow a whole set of accounts at once — the fastest way to get a timeline worth reading. Sets we assembled, and real collections curated by other people.
// i18n pages.findFriends.interestsHeading: Search for something you're interested in
// i18n pages.findFriends.interestsSub: Posts mentioning a topic, so you can follow whoever is actually talking about it.
// i18n pages.findFriends.searchAnything.title: Search posts for anything else
// i18n pages.findFriends.searchAnything.desc: Type your own subject and see who is posting about it.
// i18n pages.findFriends.advancedHeading: Advanced
// i18n pages.findFriends.advancedSub: Useful once you know who you're looking for, or you're bringing follows from somewhere else.
// i18n pages.findFriends.searchByName.title: Search for people by name
// i18n pages.findFriends.searchByName.desc: Find accounts by name, bio or the things they post about.
// i18n pages.findFriends.profileDirectory.title: Profile directory
// i18n pages.findFriends.profileDirectory.desc: Browse the accounts your instance publishes in its opt-in directory.
// i18n pages.findFriends.offsiteDirectories.title: Offsite directories
// i18n pages.findFriends.offsiteDirectories.desc: Directories other people run. These open elsewhere — you'll need to come back and search for any handle you find.
// i18n pages.findFriends.contacts.title: Look for your contacts
// i18n pages.findFriends.contacts.descPicker: Pick people from your phone's contacts and see who has an account. Distinctive names work best; common ones will need a second look.
// i18n pages.findFriends.contacts.descUpload: Upload a contacts export and see who has an account. Distinctive names work best; common ones will need a second look.
// i18n pages.findFriends.importFollowList.title: Import a follow list
// i18n pages.findFriends.importFollowList.desc: Bring your follows over from another instance, or from a Twitter archive. Works signed out too — follows are kept in this browser.
// i18n pages.findFriends.invite.title: Invite people here
// i18n pages.findFriends.invite.desc: Prewritten posts for inviting the people you already know to join you.
@Component({
  selector: 'app-find-friends',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './find-friends.html',
  styleUrl: './find-friends.css',
})
export class FindFriends {
  protected auth = inject(Auth);

  /**
   * Whether this device can offer the phone's own contact picker.
   *
   * Only changes the wording of one row — the destination works either way, via
   * a contacts export. Read once: it is a property of the browser and cannot
   * change while the page is open.
   */
  protected readonly canPickContacts = contactPickerAvailable();

  /**
   * Suggested subjects, as links into post search.
   *
   * Not a curated directory and not personalised — they are examples, and their
   * job is to answer "what would I even type" for someone facing an empty
   * search box. Broad enough that each returns something on a general-purpose
   * server, and deliberately not all tech: a list of programming languages
   * would tell a new visitor this app is not for them.
   *
   * Plain strings because each is only ever a query. Anything richer would be a
   * curation surface, which is what `/bundled-starter-kits` already is.
   */
  protected readonly interests: readonly string[] = [
    'photography',
    'gardening',
    'books',
    'cooking',
    'birds',
    'music',
    'art',
    'history',
    'science',
    'cycling',
    'movies',
    'knitting',
  ];
}
