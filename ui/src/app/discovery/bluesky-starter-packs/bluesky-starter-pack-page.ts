import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { MbNotice } from '../../design-system/notice/notice';
import { MbPageHeader, MbSection } from '../../design-system/page-header/page-header';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import { BlueskyStarterPacks, StarterPack } from '../../connections/bluesky/bluesky-starter-packs';
import { BskyProfile } from '../../connections/bluesky/bluesky-types';
import { BlueskyPeopleList } from './bluesky-people-list';

// i18n bskyPack.loading: Loading the starter pack…
// i18n bskyPack.failed: Couldn't load this starter pack.
// i18n bskyPack.retry: Retry
// i18n bskyPack.by: A Bluesky starter pack by @{{handle}}
// i18n bskyPack.counts: {{members}} people · {{joined}} joined through it
// i18n bskyPack.followAll: Follow all {{count}}
// i18n bskyPack.followingAll: Following…
// i18n bskyPack.followedAll: Followed {{count}} new accounts.
// i18n bskyPack.allFollowed: You already follow everyone here.
// i18n bskyPack.linkToFollow: Link Bluesky to follow people from this pack.
// i18n bskyPack.linkBluesky: Link Bluesky
// i18n bskyPack.people: People in this pack
// i18n bskyPack.openOnBluesky: Open on bsky.app
// i18n bskyPack.allPacks: All Bluesky starter packs
// i18n bskyPack.similar: Similar to {{name}}

/**
 * One Bluesky starter pack: who made it, what it is for, and everyone in it,
 * each with a Follow button, plus Follow all. Readable without an account;
 * following needs a linked Bluesky account.
 */
@Component({
  selector: 'app-bluesky-starter-pack-page',
  imports: [
    RouterLink,
    TranslocoPipe,
    MbPageHeader,
    MbSection,
    MbButton,
    MbNotice,
    MbContentState,
    MbContentLink,
    BlueskyPeopleList,
  ],
  templateUrl: './bluesky-starter-pack-page.html',
  styleUrl: './bluesky-starter-packs.css',
})
export class BlueskyStarterPackPage implements OnInit {
  private route = inject(ActivatedRoute);
  private packs = inject(BlueskyStarterPacks);
  private i18n = inject(TranslocoService);
  protected session = inject(BlueskySession);

  protected readonly list = viewChild(BlueskyPeopleList);
  protected pack = signal<StarterPack | null>(null);
  protected loading = signal(false);
  protected failed = signal(false);
  protected followingAll = signal(false);
  protected notice = signal('');
  protected error = signal('');
  protected similar = signal<{ name: string; people: BskyProfile[] } | null>(null);

  /** Members the viewer does not follow yet (and is not). */
  protected readonly toFollow = computed(() => {
    const pack = this.pack();
    const list = this.list();
    const me = this.session.session()?.did;
    if (!pack) return 0;
    return pack.members.filter(
      (person) =>
        person.did !== me && !(list ? list.isFollowing(person) : !!person.viewer?.following),
    ).length;
  });

  protected readonly bskyUrl = computed(() => {
    const pack = this.pack();
    if (!pack) return '';
    const rkey = pack.uri.split('/').pop();
    return `https://bsky.app/starter-pack/${pack.creator.handle}/${rkey}`;
  });

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    const params = this.route.snapshot.paramMap;
    this.loading.set(true);
    this.failed.set(false);
    try {
      const uri = await this.packs.uriFor(params.get('actor') ?? '', params.get('rkey') ?? '');
      this.pack.set(await this.packs.load(uri));
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected async followAll(): Promise<void> {
    const list = this.list();
    if (!list || this.followingAll()) return;
    this.followingAll.set(true);
    this.notice.set('');
    const count = await list.followAll();
    this.followingAll.set(false);
    this.notice.set(this.i18n.translate('bskyPack.followedAll', { count }));
  }

  /** After a single follow, offer accounts like that one, as bsky.app does. */
  protected async showSimilar(person: BskyProfile): Promise<void> {
    try {
      const people = await this.packs.similarTo(person.did);
      const inPack = new Set(this.pack()?.members.map((m) => m.did));
      const fresh = people.filter((p) => !inPack.has(p.did)).slice(0, 5);
      this.similar.set(
        fresh.length ? { name: person.displayName || person.handle, people: fresh } : null,
      );
    } catch {
      this.similar.set(null);
    }
  }

  protected followFailed(name: string): void {
    this.error.set(this.i18n.translate('bskyPeople.followFailed', { name }));
  }
}
