import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { MbButton } from '../../../design-system/button/button';
import { MbContentState } from '../../../design-system/content-state/content-state';
import { MbContentLink } from '../../../design-system/metadata/metadata';
import { MbNotice } from '../../../design-system/notice/notice';
import { BlueskyChatApi } from '../../../connections/bluesky/bluesky-chat-api';
import {
  BskyJoinLinkPreview,
  joinCodeFrom,
  joinLinkUrl,
} from '../../../connections/bluesky/bluesky-group-chat';
import { BlueskySession } from '../../../connections/bluesky/bluesky-session';

// i18n pages.conversations.group.join.title: Join a Bluesky group
// i18n pages.conversations.group.join.loading: Looking up the group…
// i18n pages.conversations.group.join.invalid: That join link doesn't lead to a group. It may have been turned off.
// i18n pages.conversations.group.join.linkBluesky: Link a Bluesky account to join groups.
// i18n pages.conversations.group.join.connect: Link Bluesky
// i18n pages.conversations.group.join.by: Started by {{name}} · {{count}} of {{limit}} members
// i18n pages.conversations.group.join.approval: The owner lets people in.
// i18n pages.conversations.group.join.join: Join
// i18n pages.conversations.group.join.ask: Ask to join
// i18n pages.conversations.group.join.asked: Asked. You'll find the group in Chat once the owner lets you in.
// i18n pages.conversations.group.join.failed: Bluesky didn't let you join. The group may be full, or limited to people the owner follows.
// i18n pages.conversations.group.join.openOnBluesky: Open on bsky.app

/**
 * `/bsky/chat/<code>`: a Bluesky group's join link, the same shape as
 * bsky.app's. Shows what the group is, then joins it (or asks to, when the
 * owner approves people) and opens it in Chat.
 */
@Component({
  selector: 'app-bluesky-join-group',
  imports: [RouterLink, TranslocoPipe, MbButton, MbContentState, MbContentLink, MbNotice],
  template: `
    <section class="join-page">
      <h1>{{ 'pages.conversations.group.join.title' | transloco }}</h1>
      @if (!session.linked()) {
        <mb-content-state
          kind="empty"
          [title]="'pages.conversations.group.join.linkBluesky' | transloco"
        >
          <a mbContentLink routerLink="/settings/connections/bluesky">{{
            'pages.conversations.group.join.connect' | transloco
          }}</a>
        </mb-content-state>
      } @else if (loading()) {
        <mb-content-state
          kind="loading"
          announcement="status"
          [title]="'pages.conversations.group.join.loading' | transloco"
        />
      } @else if (preview(); as group) {
        <h2>{{ group.name }}</h2>
        <p class="muted">
          {{
            'pages.conversations.group.join.by'
              | transloco
                : {
                    name: group.owner.displayName || group.owner.handle,
                    count: group.memberCount,
                    limit: group.memberLimit,
                  }
          }}
        </p>
        @if (group.requireApproval) {
          <p class="muted small">{{ 'pages.conversations.group.join.approval' | transloco }}</p>
        }
        @if (asked()) {
          <mb-notice announcement="status">{{
            'pages.conversations.group.join.asked' | transloco
          }}</mb-notice>
        } @else {
          <button mbButton type="button" [disabled]="joining()" (click)="join()">
            {{
              (group.requireApproval
                ? 'pages.conversations.group.join.ask'
                : 'pages.conversations.group.join.join'
              ) | transloco
            }}
          </button>
        }
        @if (failed()) {
          <mb-notice tone="error" announcement="alert">{{
            'pages.conversations.group.join.failed' | transloco
          }}</mb-notice>
        }
      } @else {
        <mb-content-state
          kind="error"
          announcement="alert"
          [title]="'pages.conversations.group.join.invalid' | transloco"
        >
          @if (code) {
            <a mbContentLink [href]="bskyUrl()" target="_blank" rel="noopener noreferrer">{{
              'pages.conversations.group.join.openOnBluesky' | transloco
            }}</a>
          }
        </mb-content-state>
      }
    </section>
  `,
  styles: `
    .join-page {
      padding: 16px;
      max-width: 36rem;
    }
  `,
})
export class BlueskyJoinGroup implements OnInit {
  protected session = inject(BlueskySession);
  private chat = inject(BlueskyChatApi);
  private router = inject(Router);
  protected readonly code = joinCodeFrom(
    inject(ActivatedRoute).snapshot.paramMap.get('code') ?? '',
  );

  protected loading = signal(true);
  protected preview = signal<BskyJoinLinkPreview | null>(null);
  protected joining = signal(false);
  protected asked = signal(false);
  protected failed = signal(false);

  protected bskyUrl(): string {
    return this.code ? joinLinkUrl(this.code) : 'https://bsky.app/';
  }

  ngOnInit(): void {
    void this.load();
  }

  private async load(): Promise<void> {
    if (!this.code || !this.session.linked()) {
      this.loading.set(false);
      return;
    }
    try {
      const { joinLinkPreviews } = await firstValueFrom(this.chat.joinLinkPreview(this.code));
      const found = joinLinkPreviews.find((p) => p.code === this.code && !!p.convoId) ?? null;
      // Already a member: straight to the chat.
      if (found?.convo?.id) {
        await this.openChat(found.convo.id);
        return;
      }
      this.preview.set(found);
      if (found?.viewer?.requestedAt) this.asked.set(true);
    } catch {
      this.preview.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  protected async join(): Promise<void> {
    if (!this.code || this.joining()) return;
    this.joining.set(true);
    this.failed.set(false);
    try {
      const result = await firstValueFrom(this.chat.requestJoin(this.code));
      if (result.convo && result.status === 'joined') {
        await this.openChat(result.convo.id);
      } else {
        this.asked.set(true);
      }
    } catch {
      this.failed.set(true);
    } finally {
      this.joining.set(false);
    }
  }

  private async openChat(convoId: string): Promise<void> {
    await this.router.navigate(['/conversations'], { queryParams: { open: `bsky:${convoId}` } });
  }
}
