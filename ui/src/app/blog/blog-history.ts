import { computed, Injectable, signal } from '@angular/core';
import { scopedKey } from '../platform/session/account-scope';

const KEY_BASE = 'mockingbird_blog_history';
export const BLOG_HISTORY_LIMIT = 8;

export interface BlogVisit {
  handle: string;
  name: string;
  avatar: string;
  at: string;
}

function valid(value: unknown): value is BlogVisit {
  const visit = value as BlogVisit;
  return (
    !!visit &&
    typeof visit.handle === 'string' &&
    typeof visit.name === 'string' &&
    typeof visit.avatar === 'string' &&
    typeof visit.at === 'string'
  );
}

/**
 * Blogs this account opened lately, newest first: a starter blogroll that
 * works on the web, before Native's Roll. Private (it says whom you read) and
 * per account, like the reading library.
 */
@Injectable({ providedIn: 'root' })
export class BlogHistory {
  private readonly key = computed(() => scopedKey(KEY_BASE));
  private readonly version = signal(0);

  readonly visits = computed<BlogVisit[]>(() => {
    this.version();
    try {
      const value: unknown = JSON.parse(localStorage.getItem(this.key()) ?? '[]');
      return Array.isArray(value) ? value.filter(valid).slice(0, BLOG_HISTORY_LIMIT) : [];
    } catch {
      return [];
    }
  });

  record(visit: Omit<BlogVisit, 'at'>, now = new Date()): void {
    const handle = visit.handle.toLowerCase();
    const next = [
      { ...visit, handle, at: now.toISOString() },
      ...this.visits().filter((item) => item.handle !== handle),
    ].slice(0, BLOG_HISTORY_LIMIT);
    this.write(next);
  }

  clear(): void {
    this.write([]);
  }

  private write(visits: BlogVisit[]): void {
    try {
      if (visits.length) {
        localStorage.setItem(this.key(), JSON.stringify(visits));
      } else {
        localStorage.removeItem(this.key());
      }
    } catch {
      // Without storage the rail simply has nothing to show.
    }
    this.version.update((n) => n + 1);
  }
}
