import {
  Component,
  inject,
  input,
  OnInit,
  output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom, Observable } from 'rxjs';
import { MbButton } from '../../../design-system/button/button';
import { MbCheckbox } from '../../../design-system/checkbox/checkbox';
import { MbDialog } from '../../../design-system/dialog/dialog';
import { MbControl, MbField } from '../../../design-system/field/field';
import { MbNotice } from '../../../design-system/notice/notice';
import { BlueskyApi } from '../../../connections/bluesky/bluesky-api';
import { BlueskyChatApi } from '../../../connections/bluesky/bluesky-chat-api';
import { joinLinkUrl } from '../../../connections/bluesky/bluesky-group-chat';
import {
  BskyChatMember,
  BskyConvoView,
  BskyGroupConvo,
  BskyJoinLink,
} from '../../../connections/bluesky/bluesky-types';
import { parseHandles } from './bluesky-new-group';

// i18n pages.conversations.group.settings.title: Group settings
// i18n pages.conversations.group.settings.close: Done
// i18n pages.conversations.group.settings.name: Group name
// i18n pages.conversations.group.settings.rename: Rename
// i18n pages.conversations.group.settings.members: Members ({{count}})
// i18n pages.conversations.group.settings.owner: owner
// i18n pages.conversations.group.settings.remove: Remove
// i18n pages.conversations.group.settings.add: Add people
// i18n pages.conversations.group.settings.addButton: Add
// i18n pages.conversations.group.settings.link: Join link
// i18n pages.conversations.group.settings.linkHint: Anyone with the link can join, or ask to join when approval is on.
// i18n pages.conversations.group.settings.makeLink: Make a join link
// i18n pages.conversations.group.settings.requireApproval: Ask me before people join
// i18n pages.conversations.group.settings.copy: Copy link
// i18n pages.conversations.group.settings.copied: Copied.
// i18n pages.conversations.group.settings.turnOff: Turn the link off
// i18n pages.conversations.group.settings.turnOn: Turn the link back on
// i18n pages.conversations.group.settings.requests: Asking to join
// i18n pages.conversations.group.settings.approve: Let in
// i18n pages.conversations.group.settings.reject: Decline
// i18n pages.conversations.group.settings.lock: Lock the group (no new messages)
// i18n pages.conversations.group.settings.unlock: Unlock the group
// i18n pages.conversations.group.settings.lockedForever: This group was locked for good by Bluesky's moderators.
// i18n pages.conversations.group.settings.failed: Bluesky didn't accept that. Try again.
// i18n pages.conversations.group.settings.ownerOnly: Only the group's owner can change these.

/**
 * A Bluesky group's settings. Everyone sees the members; the owner can rename
 * the group, add and remove people, lock it, manage its join link and answer
 * join requests. Each change is sent at once; `changed` hands back the
 * updated convo (or null when only the link changed) so the page refreshes.
 */
@Component({
  selector: 'app-bluesky-group-settings',
  imports: [
    FormsModule,
    TranslocoPipe,
    MbDialog,
    MbField,
    MbControl,
    MbButton,
    MbCheckbox,
    MbNotice,
  ],
  templateUrl: './bluesky-group-settings.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './bluesky-group.css',
})
export class BlueskyGroupSettings implements OnInit {
  private api = inject(BlueskyApi);
  private chat = inject(BlueskyChatApi);
  private transloco = inject(TranslocoService);

  readonly convoId = input.required<string>();
  readonly group = input.required<BskyGroupConvo>();
  readonly owner = input(false);
  readonly closed = output<void>();
  readonly changed = output<BskyConvoView | null>();

  protected members = signal<BskyChatMember[]>([]);
  protected requests = signal<{ requestedBy: BskyChatMember; requestedAt: string }[]>([]);
  protected name = signal('');
  protected addHandles = signal('');
  protected requireApproval = signal(true);
  protected link = signal<BskyJoinLink | null>(null);
  protected locked = signal(false);
  protected busy = signal(false);
  protected error = signal('');
  protected copied = signal(false);

  ngOnInit(): void {
    this.name.set(this.group().name);
    this.link.set(this.group().joinLink ?? null);
    this.locked.set(this.group().lockStatus !== 'unlocked');
    void this.loadMembers();
    if (this.owner() && this.group().joinRequestCount) void this.loadRequests();
  }

  protected lockedForever(): boolean {
    return this.group().lockStatus === 'locked-permanently';
  }

  protected isOwner(member: BskyChatMember): boolean {
    return member.kind?.role === 'owner';
  }

  protected linkUrl(): string {
    const link = this.link();
    return link ? joinLinkUrl(link.code) : '';
  }

  private async loadMembers(): Promise<void> {
    try {
      this.members.set((await firstValueFrom(this.chat.getMembers(this.convoId()))).members);
    } catch {
      this.error.set(this.t('pages.conversations.group.settings.failed'));
    }
  }

  private async loadRequests(): Promise<void> {
    try {
      this.requests.set(
        (await firstValueFrom(this.chat.listJoinRequests(this.convoId()))).requests,
      );
    } catch {
      // The list stays empty; the group's count still says there are some.
    }
  }

  protected rename(): void {
    const name = this.name().trim();
    if (!name || name === this.group().name) return;
    void this.act(this.chat.renameGroup(this.convoId(), name));
  }

  protected async add(): Promise<void> {
    const handles = parseHandles(this.addHandles());
    if (!handles.length) return;
    await this.run(async () => {
      const dids = await Promise.all(
        handles.map(async (h) =>
          h.startsWith('did:') ? h : (await firstValueFrom(this.api.resolveHandle(h))).did,
        ),
      );
      const { convo } = await firstValueFrom(this.chat.addMembers(this.convoId(), dids));
      this.addHandles.set('');
      await this.loadMembers();
      this.changed.emit(convo);
    });
  }

  protected async remove(member: BskyChatMember): Promise<void> {
    await this.run(async () => {
      const { convo } = await firstValueFrom(this.chat.removeMembers(this.convoId(), [member.did]));
      this.members.update((list) => list.filter((m) => m.did !== member.did));
      this.changed.emit(convo);
    });
  }

  protected async setLocked(locked: boolean): Promise<void> {
    await this.run(async () => {
      const { convo } = await firstValueFrom(this.chat.setLocked(this.convoId(), locked));
      this.locked.set(locked);
      this.changed.emit(convo);
    });
  }

  protected async makeLink(): Promise<void> {
    await this.run(async () => {
      const { joinLink } = await firstValueFrom(
        this.chat.createJoinLink(this.convoId(), this.requireApproval()),
      );
      this.link.set(joinLink);
      this.changed.emit(null);
    });
  }

  protected async setLinkEnabled(enabled: boolean): Promise<void> {
    await this.run(async () => {
      const { joinLink } = await firstValueFrom(
        this.chat.setJoinLinkEnabled(this.convoId(), enabled),
      );
      this.link.set(joinLink);
      this.changed.emit(null);
    });
  }

  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.linkUrl());
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }

  protected async answer(member: BskyChatMember, approve: boolean): Promise<void> {
    await this.run(async () => {
      await firstValueFrom(this.chat.answerJoinRequest(this.convoId(), member.did, approve));
      this.requests.update((list) => list.filter((r) => r.requestedBy.did !== member.did));
      if (approve) await this.loadMembers();
      this.changed.emit(null);
    });
  }

  private async act(call: Observable<{ convo: BskyConvoView }>): Promise<void> {
    await this.run(async () => this.changed.emit((await firstValueFrom(call)).convo));
  }

  private async run(change: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await change();
    } catch {
      this.error.set(this.t('pages.conversations.group.settings.failed'));
    } finally {
      this.busy.set(false);
    }
  }

  private t(key: string): string {
    return this.transloco.translate<string>(key);
  }
}
