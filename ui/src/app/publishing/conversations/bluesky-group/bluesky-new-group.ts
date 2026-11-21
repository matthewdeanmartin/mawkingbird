import { Component, inject, output, signal } from '@angular/core';
import { Router } from '@angular/router';
import { joinCodeFrom } from '../../../connections/bluesky/bluesky-group-chat';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { MbButton } from '../../../design-system/button/button';
import { MbDialog } from '../../../design-system/dialog/dialog';
import { MbControl, MbField } from '../../../design-system/field/field';
import { MbNotice } from '../../../design-system/notice/notice';
import { BlueskyApi } from '../../../connections/bluesky/bluesky-api';
import { BlueskyChatApi } from '../../../connections/bluesky/bluesky-chat-api';
import { BskyConvoView } from '../../../connections/bluesky/bluesky-types';

// i18n pages.conversations.group.new.title: New Bluesky group
// i18n pages.conversations.group.new.name: Group name
// i18n pages.conversations.group.new.members: People to add
// i18n pages.conversations.group.new.membersHint: Bluesky handles, separated by spaces or commas. You can add more later or share a join link.
// i18n pages.conversations.group.new.create: Create group
// i18n pages.conversations.group.new.cancel: Cancel
// i18n pages.conversations.group.new.unknown: Couldn't find {{handles}} on Bluesky.
// i18n pages.conversations.group.new.haveLink: Have a join link?
// i18n pages.conversations.group.new.linkLabel: Join link
// i18n pages.conversations.group.new.open: Open
// i18n pages.conversations.group.new.badLink: That isn't a Bluesky group link (bsky.app/chat/…).
// i18n pages.conversations.group.new.failed: Bluesky didn't create the group. Some people may not accept group chats.

/** Handles typed in one box, as a clean list: no @, no duplicates. */
export function parseHandles(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,]+/)
        .map((h) => h.trim().replace(/^@/, '').toLowerCase())
        .filter(Boolean),
    ),
  ];
}

/**
 * Start a Bluesky group chat: a name and the people in it (by handle). The
 * reader becomes its owner. Emits the new convo so the page can open it.
 */
@Component({
  selector: 'app-bluesky-new-group',
  imports: [FormsModule, TranslocoPipe, MbDialog, MbField, MbControl, MbButton, MbNotice],
  template: `
    <mb-dialog
      [title]="'pages.conversations.group.new.title' | transloco"
      [closeLabel]="'pages.conversations.group.new.cancel' | transloco"
      [busy]="working()"
      (dismissed)="closed.emit()"
    >
      <form class="group-form" (ngSubmit)="create()">
        <mb-field [label]="'pages.conversations.group.new.name' | transloco">
          <input
            mbControl
            name="groupName"
            maxlength="128"
            [ngModel]="name()"
            (ngModelChange)="name.set($event)"
            [disabled]="working()"
          />
        </mb-field>
        <mb-field
          [label]="'pages.conversations.group.new.members' | transloco"
          [hint]="'pages.conversations.group.new.membersHint' | transloco"
        >
          <textarea
            mbControl
            name="groupMembers"
            rows="3"
            autocapitalize="none"
            spellcheck="false"
            [ngModel]="members()"
            (ngModelChange)="members.set($event)"
            [disabled]="working()"
          ></textarea>
        </mb-field>
        @if (error(); as message) {
          <mb-notice tone="error" announcement="alert">{{ message }}</mb-notice>
        }
        <button mbButton type="submit" [disabled]="working() || !name().trim()">
          {{ 'pages.conversations.group.new.create' | transloco }}
        </button>
      </form>
      <form class="group-form group-join" (ngSubmit)="openLink()">
        <h3 class="group-heading">{{ 'pages.conversations.group.new.haveLink' | transloco }}</h3>
        <mb-field [label]="'pages.conversations.group.new.linkLabel' | transloco">
          <input
            mbControl
            name="joinLink"
            type="url"
            [ngModel]="link()"
            (ngModelChange)="link.set($event)"
          />
        </mb-field>
        @if (badLink()) {
          <mb-notice tone="error" announcement="alert">{{
            'pages.conversations.group.new.badLink' | transloco
          }}</mb-notice>
        }
        <button mbButton type="submit" variant="outline" [disabled]="!link().trim()">
          {{ 'pages.conversations.group.new.open' | transloco }}
        </button>
      </form>
    </mb-dialog>
  `,
  styleUrl: './bluesky-group.css',
})
export class BlueskyNewGroup {
  private api = inject(BlueskyApi);
  private chat = inject(BlueskyChatApi);
  private transloco = inject(TranslocoService);

  readonly closed = output<void>();
  readonly created = output<BskyConvoView>();

  protected name = signal('');
  protected members = signal('');
  protected working = signal(false);
  protected link = signal('');
  protected badLink = signal(false);
  private router = inject(Router);

  /** A pasted join link opens the group's join page. */
  protected openLink(): void {
    const code = joinCodeFrom(this.link());
    this.badLink.set(!code);
    if (!code) return;
    this.closed.emit();
    void this.router.navigate(['/bsky/chat', code]);
  }
  protected error = signal('');

  protected async create(): Promise<void> {
    const name = this.name().trim();
    if (!name || this.working()) return;
    this.working.set(true);
    this.error.set('');
    const handles = parseHandles(this.members());
    const dids: string[] = [];
    const unknown: string[] = [];
    for (const handle of handles) {
      try {
        dids.push(
          handle.startsWith('did:')
            ? handle
            : (await firstValueFrom(this.api.resolveHandle(handle))).did,
        );
      } catch {
        unknown.push(`@${handle}`);
      }
    }
    if (unknown.length) {
      this.working.set(false);
      this.error.set(
        this.t('pages.conversations.group.new.unknown', { handles: unknown.join(', ') }),
      );
      return;
    }
    try {
      const { convo } = await firstValueFrom(this.chat.createGroup(name, dids));
      this.created.emit(convo);
    } catch {
      this.error.set(this.t('pages.conversations.group.new.failed'));
    } finally {
      this.working.set(false);
    }
  }

  private t(key: string, params?: Record<string, string>): string {
    return this.transloco.translate<string>(key, params);
  }
}
