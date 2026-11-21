import { Component, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbBadge } from '../../../design-system/badge/badge';
import { MbButton } from '../../../design-system/button/button';
import { MbCheckbox } from '../../../design-system/checkbox/checkbox';
import { MbDialog } from '../../../design-system/dialog/dialog';
import { MbControl, MbField } from '../../../design-system/field/field';
import { MbNotice } from '../../../design-system/notice/notice';
import {
  BlueskyLists,
  BSKY_MOD_LIST,
  BskyListMembership,
} from '../../../connections/bluesky/bluesky-lists';

// i18n bskyListDialog.title: Lists for @{{handle}}
// i18n bskyListDialog.done: Done
// i18n bskyListDialog.loading: Loading your Bluesky lists…
// i18n bskyListDialog.empty: You have no Bluesky lists yet.
// i18n bskyListDialog.modList: Moderation list
// i18n bskyListDialog.public: Bluesky lists are public: anyone can see who is on them.
// i18n bskyListDialog.newHeading: New list
// i18n bskyListDialog.name: Name
// i18n bskyListDialog.kind: Kind
// i18n bskyListDialog.curate: People to read (a feed)
// i18n bskyListDialog.mod: People to mute or block
// i18n bskyListDialog.create: Create and add
// i18n bskyListDialog.failed: Bluesky didn't accept that. Try again.
// i18n bskyListDialog.loadFailed: Your Bluesky lists didn't load.

/**
 * Put a Bluesky account on the reader's own Bluesky lists, or take them off,
 * and make a new list on the spot. Each tick writes at once (a listitem
 * record), as bsky.app's "Add to lists" does. Lists are public on Bluesky, so
 * the dialog says so.
 */
@Component({
  selector: 'app-bluesky-list-dialog',
  imports: [
    FormsModule,
    TranslocoPipe,
    MbDialog,
    MbCheckbox,
    MbBadge,
    MbButton,
    MbField,
    MbControl,
    MbNotice,
  ],
  templateUrl: './bluesky-list-dialog.html',
  styleUrl: './bluesky-list-dialog.css',
})
export class BlueskyListDialog implements OnInit {
  private lists = inject(BlueskyLists);

  readonly did = input.required<string>();
  readonly handle = input.required<string>();
  readonly closed = output<void>();

  protected readonly modList = BSKY_MOD_LIST;
  protected loading = signal(true);
  protected loadFailed = signal(false);
  protected rows = signal<BskyListMembership[]>([]);
  protected busy = signal(new Set<string>());
  protected failed = signal(false);
  protected newName = signal('');
  protected newKind = signal<'curate' | 'mod'>('curate');
  protected creating = signal(false);

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      this.rows.set(await this.lists.membership(this.did()));
    } catch {
      this.loadFailed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  protected async toggle(row: BskyListMembership, member: boolean): Promise<void> {
    const uri = row.list.uri;
    if (this.busy().has(uri)) return;
    this.busy.update((set) => new Set(set).add(uri));
    this.failed.set(false);
    try {
      let itemUri: string | null = null;
      if (member) itemUri = await this.lists.add(uri, this.did());
      else if (row.itemUri) await this.lists.remove(row.itemUri);
      this.rows.update((rows) => rows.map((r) => (r.list.uri === uri ? { ...r, itemUri } : r)));
    } catch {
      this.failed.set(true);
    } finally {
      this.busy.update((set) => {
        const next = new Set(set);
        next.delete(uri);
        return next;
      });
    }
  }

  protected async create(): Promise<void> {
    const name = this.newName().trim();
    if (!name || this.creating()) return;
    this.creating.set(true);
    this.failed.set(false);
    try {
      const listUri = await this.lists.create(name, this.newKind());
      await this.lists.add(listUri, this.did());
      this.newName.set('');
      await this.load();
    } catch {
      this.failed.set(true);
    } finally {
      this.creating.set(false);
    }
  }
}
