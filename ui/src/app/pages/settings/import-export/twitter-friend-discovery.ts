import { HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../../api';
import { Account, Relationship } from '../../../models';
import { TwitterArchivePerson } from '../../../twitter-archive';

export type TwitterFriendStatus = 'pending' | 'searching' | 'complete' | 'failed';
export type TwitterFriendConfidence = 'likely' | 'possible';

export interface TwitterFriendMatch {
  account: Account;
  signals: string[];
  confidence: TwitterFriendConfidence;
}

export interface TwitterFriendRow {
  person: TwitterArchivePerson;
  status: TwitterFriendStatus;
  matches: TwitterFriendMatch[];
  error?: string;
}

/** True when the account has fewer than ten combined posts, follows, and followers. */
export function isInactiveTwitterCandidate(account: Account): boolean {
  return account.statuses_count + account.following_count + account.followers_count < 10;
}

/** True when the profile has no useful biography or is still using a missing/default avatar. */
export function isIncompleteTwitterCandidate(account: Account): boolean {
  const bio = plainText(account.note);
  const avatar = account.avatar_static || account.avatar;
  return !bio || !avatar || /(?:^|[/_-])missing(?:[._/-]|$)/i.test(avatar);
}

/** True for declared bots or profiles whose biography identifies them as a bot or mirror. */
export function isBotOrMirrorTwitterCandidate(account: Account): boolean {
  return account.bot || /\b(?:bot|mirror)\b/i.test(plainText(account.note));
}

/**
 * True when known activity is absent or older than one calendar year.
 *
 * An omitted last_status_at means the server did not provide the field, so it is not classified
 * as stale. A present null means the account has never posted.
 */
export function isStaleTwitterCandidate(account: Account, now = new Date()): boolean {
  if (account.last_status_at === undefined) return false;
  if (account.last_status_at === null) return true;
  const lastActivity = Date.parse(account.last_status_at);
  if (!Number.isFinite(lastActivity)) return false;
  const cutoff = Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate());
  return lastActivity < cutoff;
}

/** Rank a Mastodon account against identity clues preserved in a Twitter archive. */
export function rankTwitterMatch(
  person: TwitterArchivePerson,
  account: Account,
): TwitterFriendMatch {
  const signals: string[] = [];
  const currentHandle = person.twitter_handle?.toLowerCase() ?? '';
  const previousHandles = person.previous_handles.map((handle) => handle.toLowerCase());
  const username = account.username.toLowerCase();
  const profileText = `${account.note} ${account.fields.map((field) => field.value).join(' ')}`
    .toLowerCase()
    .replaceAll('&amp;', '&');

  if (currentHandle && username === currentHandle) {
    signals.push('Mastodon username matches Twitter handle');
  } else if (previousHandles.includes(username)) {
    signals.push('Mastodon username matches a previous Twitter handle');
  }
  if (person.twitter_name && normalize(account.display_name) === normalize(person.twitter_name)) {
    signals.push('Display name matches Twitter name');
  }
  if (currentHandle && linksToTwitterHandle(profileText, currentHandle)) {
    signals.push('Mastodon profile links back to Twitter handle');
  }

  const confidence: TwitterFriendConfidence =
    signals.includes('Mastodon username matches Twitter handle') ||
    signals.includes('Mastodon profile links back to Twitter handle')
      ? 'likely'
      : 'possible';
  return { account, signals, confidence };
}

/** Resumable Twitter-handle searches through the authenticated Mastodon server. */
@Injectable({ providedIn: 'root' })
export class TwitterFriendDiscovery {
  private api = inject(Api);
  private stopRequested = false;

  readonly rows = signal<TwitterFriendRow[]>([]);
  readonly running = signal(false);
  readonly callCount = signal(0);
  readonly relationships = signal<ReadonlyMap<string, Relationship>>(new Map());
  readonly followBusy = signal<ReadonlySet<string>>(new Set());
  readonly followErrors = signal<ReadonlyMap<string, string>>(new Map());
  /** Small courtesy delay between Mastodon searches; tests set this to zero. */
  delayMs = 350;

  load(people: readonly TwitterArchivePerson[]): void {
    const seenHandles = new Set<string>();
    const searchable = people.filter((person) => {
      const handle = person.twitter_handle?.toLowerCase();
      if (!handle || seenHandles.has(handle)) return false;
      seenHandles.add(handle);
      return true;
    });
    this.stopRequested = false;
    this.running.set(false);
    this.callCount.set(0);
    this.relationships.set(new Map());
    this.followBusy.set(new Set());
    this.followErrors.set(new Map());
    this.rows.set(
      searchable.map((person) => ({
        person,
        status: 'pending' as const,
        matches: [],
      })),
    );
  }

  reset(): void {
    this.stopRequested = true;
    this.rows.set([]);
    this.running.set(false);
    this.callCount.set(0);
    this.relationships.set(new Map());
    this.followBusy.set(new Set());
    this.followErrors.set(new Map());
  }

  stop(): void {
    this.stopRequested = true;
  }

  async start(callLimit: number): Promise<void> {
    if (this.running() || this.callCount() >= callLimit) return;
    this.stopRequested = false;
    this.running.set(true);
    try {
      for (let rowIndex = 0; rowIndex < this.rows().length; rowIndex++) {
        if (this.stopRequested || this.callCount() >= callLimit) break;
        if (this.rows()[rowIndex].status !== 'pending') continue;
        await this.searchRow(rowIndex);
      }
      await this.loadRelationships();
    } finally {
      this.running.set(false);
    }
  }

  relationship(accountId: string): Relationship | null {
    return this.relationships().get(accountId) ?? null;
  }

  async follow(account: Account): Promise<void> {
    if (this.followBusy().has(account.id)) return;
    this.followBusy.update((busy) => new Set(busy).add(account.id));
    this.followErrors.update((errors) => {
      const next = new Map(errors);
      next.delete(account.id);
      return next;
    });
    try {
      const relationship = await firstValueFrom(this.api.follow(account.id));
      this.relationships.update((relationships) =>
        new Map(relationships).set(account.id, relationship),
      );
    } catch {
      this.followErrors.update((errors) =>
        new Map(errors).set(account.id, 'Could not follow this account.'),
      );
    } finally {
      this.followBusy.update((busy) => {
        const next = new Set(busy);
        next.delete(account.id);
        return next;
      });
    }
  }

  private async searchRow(rowIndex: number): Promise<void> {
    const row = this.rows()[rowIndex];
    const handle = row.person.twitter_handle;
    if (!handle) return;
    this.patch(rowIndex, { status: 'searching', error: undefined });
    this.callCount.update((count) => count + 1);
    try {
      const result = await firstValueFrom(
        this.api.search(handle, 'accounts', { resolve: false, limit: 10 }),
      );
      const matches = (result.accounts ?? [])
        .map((account) => rankTwitterMatch(row.person, account))
        .filter((match) =>
          match.signals.some(
            (signal) =>
              signal === 'Mastodon username matches Twitter handle' ||
              signal === 'Mastodon username matches a previous Twitter handle' ||
              signal === 'Mastodon profile links back to Twitter handle',
          ),
        )
        .sort(
          (left, right) =>
            Number(right.confidence === 'likely') - Number(left.confidence === 'likely') ||
            right.signals.length - left.signals.length ||
            left.account.acct.localeCompare(right.account.acct),
        )
        .slice(0, 5);
      this.patch(rowIndex, { status: 'complete', matches });
    } catch (error: unknown) {
      const status = (error as HttpErrorResponse)?.status;
      this.patch(rowIndex, {
        status: 'failed',
        error:
          status === 429
            ? 'The server is rate limiting searches. Try again later.'
            : 'Mastodon search request failed.',
      });
      if (status === 429) this.stopRequested = true;
    }
    if (!this.stopRequested && this.delayMs) await delay(this.delayMs);
  }

  private async loadRelationships(): Promise<void> {
    const ids = [
      ...new Set(
        this.rows()
          .flatMap((row) => row.matches)
          .map((match) => match.account.id)
          .filter((id) => id && !this.relationships().has(id)),
      ),
    ];
    for (let index = 0; index < ids.length; index += 80) {
      try {
        const batch = await firstValueFrom(this.api.relationships(ids.slice(index, index + 80)));
        this.relationships.update((relationships) => {
          const next = new Map(relationships);
          for (const relationship of batch) next.set(relationship.id, relationship);
          return next;
        });
      } catch {
        // Candidate cards remain useful if relationship lookup is unavailable.
      }
    }
  }

  private patch(index: number, changes: Partial<TwitterFriendRow>): void {
    this.rows.update((rows) =>
      rows.map((row, rowIndex) => (rowIndex === index ? { ...row, ...changes } : row)),
    );
  }
}

function linksToTwitterHandle(profileText: string, handle: string): boolean {
  const escaped = handle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `https?://(?:www\\.)?(?:twitter\\.com|x\\.com)/(?:@)?${escaped}(?:[/?#"'<]|$)`,
    'i',
  ).test(profileText);
}

function normalize(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function plainText(value: string): string {
  const document = new DOMParser().parseFromString(value, 'text/html');
  return (document.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
