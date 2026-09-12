import { Injectable, signal } from '@angular/core';
import { accountScopeSuffix, ANONYMOUS_SCOPE_SUFFIX, scopedKey } from './account-scope';
import { Status } from './models';

const STORAGE_BASE = 'mockingbird_private_likes';
export const PRIVATE_LIKE_LIMIT = 200;

export interface PrivateLike {
  url: string;
  author: string;
  text: string;
}

/** Small local references, never network favourites or a second post cache. */
export class PrivateLikeStore {
  readonly likes = signal<PrivateLike[]>([]);

  constructor(private readonly key: string) {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
      if (Array.isArray(saved)) {
        this.likes.set(
          saved
            .filter(
              (item): item is PrivateLike =>
                typeof item?.url === 'string' &&
                /^https?:\/\//.test(item.url) &&
                typeof item.author === 'string' &&
                typeof item.text === 'string',
            )
            .slice(0, PRIVATE_LIKE_LIMIT),
        );
      }
    } catch {
      /* An unreadable local collection starts empty. */
    }
  }

  has(status: Status): boolean {
    return this.likes().some((item) => item.url === (status.reblog ?? status).url);
  }

  toggle(status: Status): void {
    const shown = status.reblog ?? status;
    if (!shown.url || shown.url.length > 8192) throw new Error('A public post link is required.');
    if (this.has(shown)) return this.remove(shown.url);
    if (!/^https?:\/\//.test(shown.url ?? '')) throw new Error('A public post link is required.');
    if (this.likes().length >= PRIVATE_LIKE_LIMIT) throw new Error('Private likes limit reached.');
    const template = document.createElement('template');
    template.innerHTML = shown.content;
    const text = template.content.textContent ?? '';
    this.persist([
      { url: shown.url, author: shown.account.acct.slice(0, 320), text: text.slice(0, 1000) },
      ...this.likes(),
    ]);
  }

  remove(url: string): void {
    this.persist(this.likes().filter((item) => item.url !== url));
  }

  private persist(likes: PrivateLike[]): void {
    localStorage.setItem(this.key, JSON.stringify(likes));
    this.likes.set(likes);
  }
}

@Injectable({ providedIn: 'root' })
export class PrivateLikes {
  private stores = new Map<string, PrivateLikeStore>();

  current(): PrivateLikeStore | null {
    const scope = accountScopeSuffix();
    if (!scope || scope === ANONYMOUS_SCOPE_SUFFIX) return null;
    const key = scopedKey(STORAGE_BASE);
    let store = this.stores.get(key);
    if (!store) {
      store = new PrivateLikeStore(key);
      this.stores.set(key, store);
    }
    return store;
  }
}
