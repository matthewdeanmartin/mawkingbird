import { Injectable, signal } from '@angular/core';
import { accountScopeSuffix } from '../session/account-scope';

export const OUTBOX_KEY = 'mockingbird_outbox';
/** Present ("review") when queued posts must wait for the reader instead of sending on reconnect. */
export const OUTBOX_SEND_KEY = 'mockingbird_outbox_send';

export type OutboxSendMode = 'auto' | 'review';

/** The persisted shape; the Outbox service owns the behaviour. */
export interface OutboxEntry {
  id: string;
  /** The identity that wrote it; it is only ever sent from this identity. */
  scope: string;
  /** Thread parts; index 0 is the first post. */
  parts: string[];
  /** Options for the first post; later parts reply to the previous one. */
  options: {
    inReplyToId?: string;
    quotedStatusId?: string;
    quoteApprovalPolicy?: string;
    visibility?: string;
    spoilerText?: string;
    sensitive?: boolean;
    mediaIds?: string[];
    poll?: { options: string[]; expiresIn: number; multiple: boolean };
    language?: string;
    muteNotifications?: boolean;
  };
  /** Ids of the parts already posted, in order. */
  posted: string[];
  /** When the reader pressed Post. */
  createdAt: number;
  /**
   * `waiting`: sends itself when the connection returns. `held`: needs the
   * reader — too old to send unasked, or the server refused it.
   */
  state: 'waiting' | 'held';
  /** Why it is held or last failed, in reader-facing words. */
  note?: string;
}

export function readOutbox(): OutboxEntry[] {
  try {
    const raw = localStorage.getItem(OUTBOX_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? (parsed as OutboxEntry[]) : [];
  } catch {
    return [];
  }
}

/**
 * Counts of the active account's queued posts, for the offline banner and
 * start-up. Deliberately dependency-free so it can sit in the initial bundle
 * while the Outbox service (which needs the API client) loads only when
 * something is queued.
 */
@Injectable({ providedIn: 'root' })
export class OutboxSummary {
  readonly waiting = signal(0);
  readonly held = signal(0);
  /** What happens to queued posts when the connection returns. */
  readonly sendMode = signal<OutboxSendMode>(readSendMode());

  setSendMode(mode: OutboxSendMode): void {
    this.sendMode.set(mode);
    try {
      if (mode === 'auto') localStorage.removeItem(OUTBOX_SEND_KEY);
      else localStorage.setItem(OUTBOX_SEND_KEY, mode);
    } catch {
      // The choice still applies to this visit.
    }
  }

  constructor() {
    this.refresh();
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (event) => {
        if (event.key === OUTBOX_KEY) this.refresh();
      });
    }
  }

  refresh(): void {
    const scope = accountScopeSuffix();
    const mine = readOutbox().filter((entry) => entry.scope === scope);
    this.waiting.set(mine.filter((entry) => entry.state === 'waiting').length);
    this.held.set(mine.filter((entry) => entry.state === 'held').length);
  }
}

function readSendMode(): OutboxSendMode {
  try {
    return localStorage.getItem(OUTBOX_SEND_KEY) === 'review' ? 'review' : 'auto';
  } catch {
    return 'auto';
  }
}
