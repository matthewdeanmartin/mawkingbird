import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../platform/api/api';
import { ComposeOptions } from '../../platform/api/models';
import { ConnectionMeter } from '../../platform/network/connection-meter';
import {
  OUTBOX_KEY,
  OutboxEntry,
  OutboxSummary,
  readOutbox,
} from '../../platform/offline/outbox-summary';
import { accountScopeSuffix } from '../../platform/session/account-scope';
import { Drafts } from '../drafts';

/**
 * After this long, a queued post waits for the reader instead of sending
 * itself: a reply that lands half an hour late can land out of context.
 * Well inside the hour Mastodon remembers an Idempotency-Key for, so an
 * automatic resend can never duplicate a post that did get through.
 */
export const OUTBOX_AUTO_SEND_MS = 30 * 60_000;

/** What to do with a waiting entry now. */
export function outboxDecision(entry: OutboxEntry, now: number): 'send' | 'hold' {
  return now - entry.createdAt > OUTBOX_AUTO_SEND_MS ? 'hold' : 'send';
}

/** The options for part `index`, chaining a thread the way compose does. */
export function partOptions(entry: OutboxEntry, index: number): ComposeOptions {
  if (index === 0) return { ...entry.options };
  return {
    inReplyToId: entry.posted[index - 1],
    visibility: entry.options.visibility,
    quoteApprovalPolicy: entry.options.quoteApprovalPolicy,
    muteNotifications: entry.options.muteNotifications,
  };
}

/** The key compose used for the same part, so a half-sent thread resumes without repeats. */
export function partKey(entry: OutboxEntry, index: number): string {
  return `${entry.id}:fedi:${index}`;
}

/**
 * Posts written while offline (spec/low-bandwidth-offline.md, Sprint 5).
 *
 * Compose hands over a Mastodon post whose send never reached the server; it
 * goes out by itself when the connection comes back, from the same account
 * only, with the same Idempotency-Key per part. Anything older than
 * {@link OUTBOX_AUTO_SEND_MS}, or refused by the server, is held for the
 * reader on the Outbox page.
 */
@Injectable({ providedIn: 'root' })
export class Outbox {
  private readonly api = inject(Api);
  private readonly meter = inject(ConnectionMeter);
  private readonly summary = inject(OutboxSummary);
  private readonly drafts = inject(Drafts);

  /** The active account's entries, newest first. */
  readonly entries = signal<OutboxEntry[]>(this.mine());
  readonly sending = signal(false);
  private flushing = false;

  constructor() {
    effect(() => {
      const verdict = this.meter.verdict();
      untracked(() => {
        if (verdict !== 'offline' && this.meter.hints().online) void this.flush();
      });
    });
  }

  enqueue(entry: Omit<OutboxEntry, 'scope' | 'createdAt' | 'state'>): void {
    const full: OutboxEntry = {
      ...entry,
      scope: accountScopeSuffix(),
      createdAt: Date.now(),
      state: 'waiting',
    };
    this.write([full, ...readOutbox().filter((e) => e.id !== entry.id)]);
  }

  /** Send everything of this account that may send itself. */
  async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;
    try {
      for (const entry of this.mine()) {
        if (entry.state !== 'waiting') continue;
        if (outboxDecision(entry, Date.now()) === 'hold') {
          this.update(entry.id, {
            state: 'held',
            note: 'Written a while ago. Send it now, or edit it first?',
          });
          continue;
        }
        const ok = await this.send(entry);
        if (!ok) break;
      }
    } finally {
      this.flushing = false;
    }
  }

  /** The reader's Send now: sends a held or waiting entry immediately. */
  async sendNow(id: string): Promise<void> {
    const entry = this.mine().find((e) => e.id === id);
    if (!entry) return;
    this.update(id, { state: 'waiting', note: undefined });
    await this.send({ ...entry, state: 'waiting' });
  }

  remove(id: string): void {
    this.write(readOutbox().filter((e) => e.id !== id));
  }

  /** Move an entry back to Drafts so it can be edited. Returns false if the draft didn't save. */
  toDraft(id: string): boolean {
    const entry = this.mine().find((e) => e.id === id);
    if (!entry) return false;
    const outcome = this.drafts.save({
      segments: entry.parts.slice(entry.posted.length),
      spoilerText: entry.options.spoilerText ?? '',
      sensitive: !!entry.options.sensitive,
      visibility: entry.options.visibility ?? 'public',
      poll:
        entry.posted.length === 0 && entry.options.poll ? toDraftPoll(entry.options.poll) : null,
      postLanguage: entry.options.language,
      inReplyToId: entry.posted.length > 0 ? entry.posted.at(-1) : entry.options.inReplyToId,
      quotedStatusId: entry.posted.length === 0 ? entry.options.quotedStatusId : undefined,
      quoteApprovalPolicy: entry.options.quoteApprovalPolicy,
      muteNotifications: entry.options.muteNotifications,
      target: 'fedi',
    });
    if (!outcome.durable) return false;
    this.remove(id);
    return true;
  }

  /** Post the remaining parts. False when the connection failed (stop the flush). */
  private async send(entry: OutboxEntry): Promise<boolean> {
    if (entry.scope !== accountScopeSuffix()) return true;
    this.sending.set(true);
    try {
      const posted = [...entry.posted];
      for (let index = posted.length; index < entry.parts.length; index++) {
        const current = { ...entry, posted };
        const status = await firstValueFrom(
          this.api.postStatus(
            entry.parts[index],
            partOptions(current, index),
            partKey(entry, index),
          ),
        );
        posted.push(status.id);
        this.update(entry.id, { posted: [...posted] });
      }
      this.remove(entry.id);
      return true;
    } catch (error) {
      const status = error instanceof HttpErrorResponse ? error.status : -1;
      if (status === 0) {
        this.update(entry.id, { note: "Couldn't reach the server yet. It will try again." });
        return false;
      }
      this.update(entry.id, {
        state: 'held',
        note:
          status === 401 || status === 403
            ? 'That account is no longer signed in.'
            : `The server didn't accept it${status > 0 ? ` (HTTP ${status})` : ''}. Edit it or try again.`,
      });
      return true;
    } finally {
      this.sending.set(false);
    }
  }

  private mine(): OutboxEntry[] {
    const scope = accountScopeSuffix();
    return readOutbox().filter((entry) => entry.scope === scope);
  }

  private update(id: string, patch: Partial<OutboxEntry>): void {
    this.write(readOutbox().map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }

  private write(all: OutboxEntry[]): void {
    try {
      if (all.length) localStorage.setItem(OUTBOX_KEY, JSON.stringify(all));
      else localStorage.removeItem(OUTBOX_KEY);
    } catch {
      // Storage full: the in-memory list below still reflects the attempt.
    }
    this.entries.set(this.mine());
    this.summary.refresh();
  }
}

function toDraftPoll(poll: NonNullable<OutboxEntry['options']['poll']>) {
  return { options: poll.options, expiresIn: poll.expiresIn, multiple: poll.multiple };
}
