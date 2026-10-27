import { Component, computed, inject, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../api';
import { MbButton } from '../../design-system/button/button';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbControl, MbField } from '../../design-system/field/field';
import { RELATIONSHIP_BATCH } from '../../follow-state';
import { Account, UserList } from '../../models';

// i18n forum.listDialog.title: Add everyone to a list
// i18n forum.listDialog.close: Close
// i18n forum.listDialog.checking: Checking who you follow…
// i18n forum.listDialog.rule: Mastodon lists only hold people you follow. {{followed}} of the {{total}} people here can be added.
// i18n forum.listDialog.none: You don’t follow anyone in this discussion yet, and Mastodon lists only hold people you follow. Try Follow everyone first.
// i18n forum.listDialog.list: List
// i18n forum.listDialog.newList: New list…
// i18n forum.listDialog.newTitle: New list name
// i18n forum.listDialog.add: Add {{count}} people
// i18n forum.listDialog.adding: Adding…
// i18n forum.listDialog.done: Added {{added}} to {{title}}. {{skipped}} not followed were left out.
// i18n forum.listDialog.failed: Couldn’t add them: {{error}}

/** Mastodon accepts many ids per add; batches keep one failure small. */
const ADD_BATCH = 50;
const NEW_LIST = '__new__';

/**
 * Add the people in a discussion to one of my lists, or a new one.
 *
 * Mastodon only lets a list hold accounts you follow (adding anyone else is a
 * 422), so the dialog checks first and says how many can go in rather than
 * failing halfway. Accounts read from another server have no id here and are
 * not offered at all.
 */
@Component({
  selector: 'app-forum-list-dialog',
  imports: [FormsModule, TranslocoPipe, MbButton, MbDialog, MbControl, MbField],
  template: `
    <mb-dialog
      [title]="'forum.listDialog.title' | transloco"
      [closeLabel]="'forum.listDialog.close' | transloco"
      [busy]="adding()"
      (dismissed)="closed.emit()"
    >
      @if (followed() === null) {
        <p role="status">{{ 'forum.listDialog.checking' | transloco }}</p>
      } @else if (!followed()!.length) {
        <p>{{ 'forum.listDialog.none' | transloco }}</p>
      } @else {
        <p>
          {{
            'forum.listDialog.rule'
              | transloco: { followed: followed()!.length, total: accounts().length }
          }}
        </p>
        <mb-field [label]="'forum.listDialog.list' | transloco">
          <select mbControl name="list" [ngModel]="listId()" (ngModelChange)="listId.set($event)">
            @for (list of lists(); track list.id) {
              <option [value]="list.id">{{ list.title }}</option>
            }
            <option [value]="newList">{{ 'forum.listDialog.newList' | transloco }}</option>
          </select>
        </mb-field>
        @if (listId() === newList) {
          <mb-field [label]="'forum.listDialog.newTitle' | transloco">
            <input
              mbControl
              name="title"
              maxlength="80"
              [ngModel]="newTitle()"
              (ngModelChange)="newTitle.set($event)"
            />
          </mb-field>
        }
      }
      @if (result(); as message) {
        <p role="status">{{ message }}</p>
      }
      @if (error(); as message) {
        <p role="alert">
          {{ 'forum.listDialog.failed' | transloco: { error: message } }}
        </p>
      }
      <div mbDialogActions>
        @if (followed()?.length && !result()) {
          <button mbButton type="button" [disabled]="!canAdd()" (click)="add()">
            {{
              adding()
                ? ('forum.listDialog.adding' | transloco)
                : ('forum.listDialog.add' | transloco: { count: followed()!.length })
            }}
          </button>
        }
      </div>
    </mb-dialog>
  `,
})
export class ForumListDialog implements OnInit {
  private api = inject(Api);
  private transloco = inject(TranslocoService);

  /** My server's records of the people in the discussion, me excluded. */
  readonly accounts = input.required<Account[]>();
  readonly closed = output<void>();

  protected readonly newList = NEW_LIST;
  protected lists = signal<UserList[]>([]);
  protected listId = signal<string>(NEW_LIST);
  protected newTitle = signal('');
  /** The accounts I follow; null while checking. */
  protected followed = signal<Account[] | null>(null);
  protected adding = signal(false);
  protected result = signal<string | null>(null);
  protected error = signal<string | null>(null);

  protected canAdd = computed(
    () =>
      !this.adding() &&
      !!this.followed()?.length &&
      (this.listId() !== NEW_LIST || this.newTitle().trim().length > 0),
  );

  async ngOnInit(): Promise<void> {
    try {
      const lists = await firstValueFrom(this.api.lists());
      this.lists.set(lists);
      if (lists.length) this.listId.set(lists[0].id);
    } catch {
      // A new list still works.
    }
    const following = new Set<string>();
    const accounts = this.accounts();
    try {
      for (let index = 0; index < accounts.length; index += RELATIONSHIP_BATCH) {
        const batch = accounts.slice(index, index + RELATIONSHIP_BATCH).map((each) => each.id);
        for (const answer of await firstValueFrom(this.api.relationships(batch))) {
          if (answer.following) following.add(answer.id);
        }
      }
    } catch (error) {
      this.error.set(String((error as { message?: string })?.message ?? error));
    }
    this.followed.set(accounts.filter((account) => following.has(account.id)));
  }

  protected async add(): Promise<void> {
    const people = this.followed() ?? [];
    if (!this.canAdd()) return;
    this.adding.set(true);
    this.error.set(null);
    try {
      let list = this.lists().find((each) => each.id === this.listId());
      if (!list) list = await firstValueFrom(this.api.createList(this.newTitle().trim()));
      let added = 0;
      for (let index = 0; index < people.length; index += ADD_BATCH) {
        const batch = people.slice(index, index + ADD_BATCH).map((each) => each.id);
        try {
          await firstValueFrom(this.api.addManyToList(list.id, batch));
          added += batch.length;
        } catch {
          // One member already in the list fails the whole batch; go one by one.
          for (const id of batch) {
            try {
              await firstValueFrom(this.api.addManyToList(list.id, [id]));
              added++;
            } catch {
              // Already there, or no longer followed: nothing to add.
            }
          }
        }
      }
      this.result.set(
        this.transloco.translate('forum.listDialog.done', {
          added,
          title: list.title,
          skipped: this.accounts().length - people.length,
        }),
      );
    } catch (error) {
      this.error.set(String((error as { message?: string })?.message ?? error));
    } finally {
      this.adding.set(false);
    }
  }
}
