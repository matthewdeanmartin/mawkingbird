import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Terminology } from '../i18n/terminology';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import { MbControl, MbField } from '../design-system/field/field';
import { MbTab, MbTabs } from '../design-system/tabs/tabs';
import { MbCheckbox } from '../design-system/checkbox/checkbox';
import { MbFileDrop, MbPickedFile } from '../design-system/file-drop/file-drop';
import { MbMetadata } from '../design-system/metadata/metadata';
import { MbNotice } from '../design-system/notice/notice';
import { MbBarItem, MbBarList, MbStatGrid } from '../design-system/stats/stats';
import { archiveNumbers } from './archive-numbers';
import { searchLikes, searchTweets, TweetKind, tweetUrl, tweetYears } from './archive-search';
import { contactsVcard, readContacts } from './contacts-export';
import { saveBlob } from './save-file';
import type { PickedFile } from './unbird-archive';
import { UnbirdDrop } from './unbird-drop';
import { UnbirdMatcher } from './unbird-matcher';
import { websiteZip } from './website-export';

// i18n unbird.tools.tabs: Archive tools
// i18n unbird.tools.tab.search: Search
// i18n unbird.tools.tab.likes: Likes
// i18n unbird.tools.tab.numbers: Numbers
// i18n unbird.tools.tab.website: Website
// i18n unbird.tools.tab.contacts: Contacts
// i18n unbird.tools.search.label: Search your tweets
// i18n unbird.tools.search.placeholder: Words, or "an exact phrase"
// i18n unbird.tools.search.kindLabel: Show
// i18n unbird.tools.search.kind.all: Everything
// i18n unbird.tools.search.kind.originals: Your own posts
// i18n unbird.tools.search.kind.threads: Threads
// i18n unbird.tools.search.kind.replies: Replies to others
// i18n unbird.tools.search.kind.media: With photos or video
// i18n unbird.tools.search.year: Year
// i18n unbird.tools.search.anyYear: Any year
// i18n unbird.tools.search.retweets: Include retweets
// i18n unbird.tools.search.count: {{total}} found
// i18n unbird.tools.search.showing: showing the newest {{shown}}
// i18n unbird.tools.search.open: Open on Twitter
// i18n unbird.tools.search.postThis: {{post}} this
// i18n unbird.tools.search.media: {{count}} photo or video
// i18n unbird.tools.search.thread: thread
// i18n unbird.tools.search.reply: reply
// i18n unbird.tools.likes.label: Search your likes
// i18n unbird.tools.likes.lead: Everything you liked, with its text, searchable here. Twitter's archive does not say who wrote a liked tweet, so each one links back to Twitter.
// i18n unbird.tools.numbers.span: {{first}} to {{last}}, {{years}} years
// i18n unbird.tools.numbers.posts: Your own posts
// i18n unbird.tools.numbers.threads: Thread posts
// i18n unbird.tools.numbers.replies: Replies to others
// i18n unbird.tools.numbers.retweets: Retweets
// i18n unbird.tools.numbers.media: With photos or video
// i18n unbird.tools.numbers.likes: Likes
// i18n unbird.tools.numbers.following: Following
// i18n unbird.tools.numbers.followers: Followers
// i18n unbird.tools.numbers.perYear: Posts per year
// i18n unbird.tools.numbers.best: Your most-liked posts
// i18n unbird.tools.numbers.bestLikes: {{count}} likes
// i18n unbird.tools.numbers.when: You posted most on {{day}}s, around {{hour}}.
// i18n unbird.tools.numbers.talkedTo: Who you talked to most
// i18n unbird.tools.numbers.hashtags: Your hashtags
// i18n unbird.tools.numbers.private: Just for you: nothing here leaves this device.
// i18n unbird.tools.website.lead: Save your tweets as a small website (a page per year, an RSS feed) that you can put on any web host, or just keep.
// i18n unbird.tools.website.title: Site title
// i18n unbird.tools.website.baseUrl: Where it will live (optional, for the RSS feed)
// i18n unbird.tools.website.replies: Include replies to other people
// i18n unbird.tools.website.note: Retweets and likes are other people's words and are left out. Photos stay in your original archive.
// i18n unbird.tools.website.download: Download the website (.zip)
// i18n unbird.tools.contacts.lead: Twitter kept the address book you once uploaded. You can save it as a contacts file your phone can import.
// i18n unbird.tools.contacts.noNames: Twitter kept only emails and phone numbers, not names, so each contact is named after its first email or number.
// i18n unbird.tools.contacts.export: Export contacts (.vcf)
// i18n unbird.tools.contacts.ready: {{count}} contacts saved to your downloads.
// i18n unbird.tools.contacts.none: This archive has no address book.
// i18n unbird.tools.contacts.reopen: To read the address book, choose your archive again. Only that one file is opened, and nothing is kept.
// i18n unbird.tools.contacts.choose: Choose the archive…

/**
 * What to do with a Twitter archive besides leaving: search it, look back at
 * it, keep it as a website, and get the address book out. Everything runs on
 * the device.
 */
@Component({
  selector: 'app-unbird-archive-tools',
  imports: [
    FormsModule,
    MbButton,
    MbCheckbox,
    MbControl,
    MbField,
    MbBarList,
    MbFileDrop,
    MbMetadata,
    MbNotice,
    MbStatGrid,
    MbTab,
    MbTabs,
    TranslocoPipe,
    UnbirdDrop,
    RouterLink,
  ],
  templateUrl: './unbird-archive-tools.html',
  styleUrl: './unbird-archive-tools.css',
})
export class UnbirdArchiveTools implements OnInit {
  /** post/tweet/florp vocabulary, for "Post this". */
  protected readonly words = inject(Terminology).words;
  protected readonly matcher = inject(UnbirdMatcher);
  protected readonly archive = this.matcher.archive;

  /** Show the drop target when there is no archive yet. */
  readonly withDrop = input(true);

  protected readonly tab = signal('search');
  protected readonly query = signal('');
  protected readonly kind = signal<TweetKind>('all');
  protected readonly year = signal('');
  protected readonly retweets = signal(false);
  protected readonly likeQuery = signal('');

  protected readonly kinds: TweetKind[] = ['all', 'originals', 'threads', 'replies', 'media'];
  protected readonly years = computed(() => {
    const archive = this.archive();
    return archive ? tweetYears(archive) : [];
  });
  protected readonly tweets = computed(() => {
    const archive = this.archive();
    if (!archive) return { results: [], total: 0 };
    return searchTweets(archive, {
      text: this.query(),
      kind: this.kind(),
      year: this.year() || null,
      retweets: this.retweets(),
    });
  });
  protected readonly likes = computed(() => {
    const archive = this.archive();
    return archive ? searchLikes(archive, this.likeQuery()) : { results: [], total: 0 };
  });
  protected readonly numbers = computed(() => {
    const archive = this.archive();
    return archive ? archiveNumbers(archive) : null;
  });
  /** The headline tiles, in reading order. */
  protected readonly stats = computed(() => {
    const n = this.numbers();
    if (!n) return [];
    return [
      { key: 'unbird.tools.numbers.posts', value: n.originals },
      { key: 'unbird.tools.numbers.threads', value: n.threads },
      { key: 'unbird.tools.numbers.replies', value: n.replies },
      { key: 'unbird.tools.numbers.retweets', value: n.retweets },
      { key: 'unbird.tools.numbers.media', value: n.withMedia },
      { key: 'unbird.tools.numbers.likes', value: n.likes },
      { key: 'unbird.tools.numbers.following', value: n.following },
      { key: 'unbird.tools.numbers.followers', value: n.followers },
    ];
  });
  protected readonly perYear = computed<MbBarItem[]>(() =>
    (this.numbers()?.perYear ?? []).map((entry) => this.bar(entry.year, entry.tweets)),
  );
  protected readonly talkedTo = computed<MbBarItem[]>(() =>
    (this.numbers()?.talkedTo ?? []).map((person) =>
      this.bar(`@${person.twitter_handle}`, person.reply_count + person.mention_count),
    ),
  );
  protected readonly hashtags = computed<MbBarItem[]>(() =>
    (this.numbers()?.hashtags ?? []).map((tag) => this.bar(`#${tag.tag}`, tag.count)),
  );

  protected readonly siteTitle = signal('');
  protected readonly siteBase = signal('');
  protected readonly siteReplies = signal(false);

  protected readonly contacts = signal<'idle' | 'busy' | 'reopen' | 'none' | number>('idle');

  ngOnInit(): void {
    void this.matcher.restore();
  }

  protected readonly tweetUrl = tweetUrl;

  protected fmt(count: number): string {
    return count.toLocaleString();
  }

  protected date(iso: string | null): string {
    return iso ? new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';
  }

  protected year4(iso: string | null): string {
    return iso ? iso.slice(0, 4) : '';
  }

  protected day(index: number | null): string {
    if (index === null) return '';
    // 2023-01-01 was a Sunday: offset into a known week for the localized name.
    return new Date(Date.UTC(2023, 0, 1 + index, 12)).toLocaleDateString(undefined, {
      weekday: 'long',
    });
  }

  protected hour(value: number | null): string {
    if (value === null) return '';
    return new Date(2023, 0, 1, value).toLocaleTimeString(undefined, { hour: 'numeric' });
  }

  protected defaultTitle(): string {
    const owner = this.archive()?.owner;
    return owner?.displayName || (owner?.userName ? `@${owner.userName}` : 'My tweets');
  }

  protected downloadSite(): void {
    const archive = this.archive();
    if (!archive) return;
    const title = this.siteTitle().trim() || this.defaultTitle();
    saveBlob(
      websiteZip(archive, { title, replies: this.siteReplies(), baseUrl: this.siteBase().trim() }),
      `${archive.owner.userName ?? 'twitter'}-website.zip`,
    );
  }

  protected async exportContacts(
    picked: readonly PickedFile[] | null = this.matcher.picked,
  ): Promise<void> {
    if (!picked?.length) {
      this.contacts.set('reopen');
      return;
    }
    this.contacts.set('busy');
    try {
      const contacts = await readContacts(picked);
      if (!contacts?.length) {
        this.contacts.set('none');
        return;
      }
      saveBlob(new Blob([contactsVcard(contacts)], { type: 'text/vcard' }), 'twitter-contacts.vcf');
      this.contacts.set(contacts.length);
    } catch {
      this.contacts.set('reopen');
    }
  }

  protected onReopen(files: readonly MbPickedFile[]): void {
    void this.exportContacts(files.map(({ path, file }) => ({ path, blob: file })));
  }

  private bar(label: string, value: number): MbBarItem {
    return { label, value, display: this.fmt(value) };
  }

  protected isCount(value: unknown): value is number {
    return typeof value === 'number';
  }
}
