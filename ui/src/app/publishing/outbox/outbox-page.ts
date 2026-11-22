import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbNotice } from '../../design-system/notice/notice';
import { MbPageHeader } from '../../design-system/page-header/page-header';
import { ConnectionMeter } from '../../platform/network/connection-meter';
import { Outbox } from './outbox';
import { OutboxSummary } from '../../platform/offline/outbox-summary';

// i18n outbox.title: Outbox
// i18n outbox.intro: Posts you wrote without a connection. They post by themselves when you're back online, from this account only. Anything older than half an hour waits for you to send it.
// i18n outbox.drafts: Drafts
// i18n outbox.empty: Nothing is waiting to be sent.
// i18n outbox.waiting: Waiting for a connection
// i18n outbox.held: Waiting for you
// i18n outbox.sending: Sending…
// i18n outbox.parts: Already posted: {{posted}} of {{total}} in this thread.
// i18n outbox.media: Attachments: {{count}}
// i18n outbox.reply: Reply
// i18n outbox.sendNow: Send now
// i18n outbox.edit: Edit as draft
// i18n outbox.delete: Delete
// i18n outbox.editMediaNote: Attachments aren't kept in drafts; add them again when you post.
// i18n outbox.draftFailed: Couldn't save it as a draft. It is still here.
// i18n outbox.sendMode: When the connection comes back
// i18n outbox.sendMode.auto: Send queued posts automatically
// i18n outbox.sendMode.review: Wait for me to review them
// i18n outbox.reviewNote: Waiting for you to send it.
// i18n outbox.offlineNow: You're offline. These will be sent when the connection is back.

/** The queued posts of the active account (spec/low-bandwidth-offline.md, Sprint 5). */
@Component({
  selector: 'app-outbox-page',
  imports: [DatePipe, MbButton, MbNotice, MbPageHeader, RouterLink, TranslocoPipe],
  template: `
    <div class="outbox-page">
      <mb-page-header
        [title]="'outbox.title' | transloco"
        [description]="'outbox.intro' | transloco"
      >
        <a mbButton variant="link" routerLink="/drafts">{{ 'outbox.drafts' | transloco }}</a>
      </mb-page-header>
      <label class="send-mode">
        {{ 'outbox.sendMode' | transloco }}
        <select [value]="summary.sendMode()" (change)="setSendMode($event)">
          <option value="auto">{{ 'outbox.sendMode.auto' | transloco }}</option>
          <option value="review">{{ 'outbox.sendMode.review' | transloco }}</option>
        </select>
      </label>
      @if (meter.verdict() === 'offline' && outbox.entries().length) {
        <mb-notice announcement="status">{{ 'outbox.offlineNow' | transloco }}</mb-notice>
      }
      @if (error()) {
        <mb-notice tone="error" announcement="alert">{{ error() }}</mb-notice>
      }
      @for (entry of outbox.entries(); track entry.id) {
        <article class="entry" [attr.data-state]="entry.state">
          <p class="state">
            {{ (entry.state === 'held' ? 'outbox.held' : 'outbox.waiting') | transloco }}
            · {{ entry.createdAt | date: 'short' }}
            @if (entry.options.inReplyToId) {
              · {{ 'outbox.reply' | transloco }}
            }
          </p>
          @for (part of entry.parts; track $index) {
            <p class="text" [class.posted]="$index < entry.posted.length">{{ part }}</p>
          }
          @if (entry.posted.length) {
            <p class="muted">
              {{
                'outbox.parts'
                  | transloco: { posted: entry.posted.length, total: entry.parts.length }
              }}
            </p>
          }
          @if (entry.options.mediaIds?.length) {
            <p class="muted">
              {{ 'outbox.media' | transloco: { count: entry.options.mediaIds!.length } }} ·
              {{ 'outbox.editMediaNote' | transloco }}
            </p>
          }
          @if (entry.note) {
            <p class="note">{{ entry.note }}</p>
          }
          <div class="actions">
            <button
              mbButton
              type="button"
              size="small"
              [disabled]="outbox.sending()"
              (click)="outbox.sendNow(entry.id)"
            >
              {{ (outbox.sending() ? 'outbox.sending' : 'outbox.sendNow') | transloco }}
            </button>
            <button mbButton variant="outline" size="small" type="button" (click)="edit(entry.id)">
              {{ 'outbox.edit' | transloco }}
            </button>
            <button
              mbButton
              variant="link"
              tone="danger"
              size="small"
              type="button"
              (click)="outbox.remove(entry.id)"
            >
              {{ 'outbox.delete' | transloco }}
            </button>
          </div>
        </article>
      } @empty {
        <p class="muted">{{ 'outbox.empty' | transloco }}</p>
      }
    </div>
  `,
  styles: `
    .outbox-page {
      display: grid;
      gap: 16px;
      padding: 16px;
    }
    .send-mode {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      font-size: 14px;
    }
    .entry {
      display: grid;
      gap: 6px;
      padding: 12px 14px;
      border: 1px solid var(--border);
      border-inline-start: 4px solid var(--border);
      border-radius: 12px;
      background: var(--col-bg);
    }
    .entry[data-state='held'] {
      border-inline-start-color: var(--ds-warning-text);
    }
    .entry p {
      margin: 0;
    }
    .state,
    .muted {
      color: var(--muted);
      font-size: 13px;
    }
    .text {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .text.posted {
      color: var(--muted);
      text-decoration: line-through;
    }
    .note {
      color: var(--ds-warning-text);
      font-size: 14px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
  `,
})
export class OutboxPage {
  protected readonly outbox = inject(Outbox);
  protected readonly meter = inject(ConnectionMeter);
  protected readonly summary = inject(OutboxSummary);

  protected setSendMode(event: Event): void {
    const mode = (event.target as HTMLSelectElement).value === 'review' ? 'review' : 'auto';
    this.summary.setSendMode(mode);
    if (mode === 'auto') void this.outbox.flush();
  }
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);
  protected readonly error = signal<string | null>(null);

  protected edit(id: string): void {
    if (this.outbox.toDraft(id)) {
      void this.router.navigateByUrl('/drafts');
    } else {
      this.error.set(this.transloco.translate('outbox.draftFailed'));
    }
  }
}
