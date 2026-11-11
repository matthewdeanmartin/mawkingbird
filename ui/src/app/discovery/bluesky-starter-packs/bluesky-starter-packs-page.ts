import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { MbNotice } from '../../design-system/notice/notice';
import { MbPageHeader, MbSection } from '../../design-system/page-header/page-header';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import {
  BlueskyStarterPacks,
  STARTER_PACK_MAX_MEMBERS,
  StarterPackSummary,
  starterPackPath,
} from '../../connections/bluesky/bluesky-starter-packs';
import { BskyListView, BskyProfile } from '../../connections/bluesky/bluesky-types';
import { BlueskyPeopleList } from './bluesky-people-list';

// i18n bskyPacks.title: Bluesky starter packs
// i18n bskyPacks.intro: Starter packs are sets of accounts people put together on Bluesky, so newcomers can follow a whole community at once. Mawkingbird's own Starter Kits are separate.
// i18n bskyPacks.open.title: Open a starter pack
// i18n bskyPacks.open.address: Starter pack address
// i18n bskyPacks.open.placeholder: https://bsky.app/starter-pack/…
// i18n bskyPacks.open.submit: Open
// i18n bskyPacks.mine.title: Your starter packs
// i18n bskyPacks.mine.empty: You have not made a starter pack yet.
// i18n bskyPacks.mine.people: {{count}} people
// i18n bskyPacks.create.title: Make a starter pack
// i18n bskyPacks.create.hint: Start from one of your Bluesky lists. The pack gets its own copy of the people on it, up to {{max}}.
// i18n bskyPacks.create.name: Name
// i18n bskyPacks.create.description: What it is for (optional)
// i18n bskyPacks.create.list: People from
// i18n bskyPacks.create.chooseList: Choose a list
// i18n bskyPacks.create.listCount: {{name}} ({{count}} people)
// i18n bskyPacks.create.noLists: Make a list of people on bsky.app first; it becomes the pack's members.
// i18n bskyPacks.create.submit: Make the starter pack
// i18n bskyPacks.create.empty: That list has nobody on it.
// i18n bskyPacks.suggested.title: Suggested for you
// i18n bskyPacks.suggested.empty: Bluesky has no suggestions right now.
// i18n bskyPacks.notLinked: Link Bluesky to see your own packs, make one, and get suggestions.
// i18n bskyPacks.linkBluesky: Link Bluesky
// i18n bskyPacks.failed: Something went wrong talking to Bluesky.

/**
 * The home of Bluesky starter packs in Mawkingbird: open one from a link,
 * see and make your own, and Bluesky's own follow suggestions. New UI with no
 * Mastodon counterpart; Mawkingbird's bundled Starter Kits live elsewhere.
 */
@Component({
  selector: 'app-bluesky-starter-packs-page',
  imports: [
    FormsModule,
    RouterLink,
    TranslocoPipe,
    MbPageHeader,
    MbSection,
    MbField,
    MbControl,
    MbButton,
    MbNotice,
    MbContentState,
    MbContentLink,
    BlueskyPeopleList,
  ],
  templateUrl: './bluesky-starter-packs-page.html',
  styleUrl: './bluesky-starter-packs.css',
})
export class BlueskyStarterPacksPage implements OnInit {
  private packs = inject(BlueskyStarterPacks);
  private router = inject(Router);
  private i18n = inject(TranslocoService);
  protected session = inject(BlueskySession);

  protected readonly max = STARTER_PACK_MAX_MEMBERS;
  protected readonly packPath = starterPackPath;

  protected address = signal('');
  protected openError = signal('');
  protected mine = signal<StarterPackSummary[]>([]);
  protected lists = signal<BskyListView[]>([]);
  protected suggested = signal<BskyProfile[] | null>(null);
  protected name = signal('');
  protected description = signal('');
  protected listUri = signal('');
  protected creating = signal(false);
  protected createError = signal('');
  protected loadError = signal('');

  ngOnInit(): void {
    const did = this.session.session()?.did;
    if (!did) return;
    void this.packs.byActor(did).then(
      (packs) => this.mine.set(packs),
      () => this.loadError.set(this.i18n.translate('bskyPacks.failed')),
    );
    void this.packs.ownLists().then(
      (lists) => this.lists.set(lists),
      () => this.lists.set([]),
    );
    void this.packs.suggestions().then(
      (people) => this.suggested.set(people),
      () => this.suggested.set([]),
    );
  }

  protected async open(): Promise<void> {
    this.openError.set('');
    try {
      const uri = await this.packs.uriFromAddress(this.address());
      await this.router.navigate(starterPackPath(uri));
    } catch (error: unknown) {
      this.openError.set(error instanceof Error ? error.message : String(error));
    }
  }

  protected async create(): Promise<void> {
    const name = this.name().trim();
    if (!name || !this.listUri() || this.creating()) return;
    this.creating.set(true);
    this.createError.set('');
    try {
      const members = await this.packs.listMembers(this.listUri());
      if (!members.length) {
        this.createError.set(this.i18n.translate('bskyPacks.create.empty'));
        return;
      }
      const uri = await this.packs.create(
        name,
        this.description().trim(),
        members.map((member) => member.did),
      );
      await this.router.navigate(starterPackPath(uri));
    } catch (error: unknown) {
      this.createError.set(error instanceof Error ? error.message : String(error));
    } finally {
      this.creating.set(false);
    }
  }
}
