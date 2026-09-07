import { computed, inject, Injectable, signal } from '@angular/core';
import { scopedKey } from '../account-scope';
import { PageDiagnostics } from '../page-diagnostics';

/**
 * Named bundles of hashtags, read as one feed.
 *
 * ## Why this isn't a thing Mastodon does
 *
 * Following a hashtag folds it into your home timeline, permanently and
 * indistinguishably. There is no way to say "these six tags are one topic I want to read
 * *as a topic*, on purpose, when I feel like it". A bundle is that: a hashtag list you
 * open like a list, rather than a subscription that leaks into everything else.
 *
 * The server has no endpoint for this and never will, so the feed is merged in the
 * browser — one `GET /timelines/tag/:tag` per member, interleaved by recency. That is
 * the same client-side synthesis {@link ListFeedResolver} already does for accounts, for
 * the same reason ([[mockingbird-client-side-constraint]]).
 *
 * ## Why ten
 *
 * Each tag in a bundle is one API call every time the feed opens. Ten is where a bundle
 * stops being a topic and starts being a denial-of-service against someone else's
 * server — and, at Mastodon's default rate limits, where the reader would start waiting
 * noticeably. The cap lives in this store rather than in the UI so that no future caller
 * can quietly exceed it: a limit enforced only by a disabled button is not a limit.
 *
 * ## Anonymous-friendly
 *
 * Tag timelines are readable without a token ([[mastodon-social-anonymous-endpoints]]),
 * which makes bundles one of the few feed kinds that work identically signed in and
 * signed out. Nothing here checks auth, deliberately.
 */

const STORAGE_BASE = 'mockingbird_tag_bundles';
const STATE_VERSION = 1;

/**
 * How many tags one bundle may hold.
 *
 * Ten calls per feed open. See the note above — this is a politeness limit against
 * other people's servers, not a storage one.
 */
export const MAX_BUNDLE_TAGS = 10;

export interface TagBundle {
  id: string;
  title: string;
  /** Bare tag names, lowercased, no leading `#`. */
  tags: string[];
  createdAt: string;
}

interface TagBundleState {
  version: typeof STATE_VERSION;
  bundles: TagBundle[];
}

/**
 * A tag as we store it: no `#`, lowercased, no whitespace.
 *
 * Mastodon treats hashtags case-insensitively and strips the sigil, so `#Rust`, `rust`
 * and `Rust` are one tag. Normalizing on the way in means the cap counts real tags
 * rather than spellings of the same one.
 */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, '').toLowerCase();
}

@Injectable({ providedIn: 'root' })
export class TagBundles {
  private diagnostics = inject(PageDiagnostics);

  private state = signal<TagBundleState>(this.load());

  readonly bundles = computed(() => this.state().bundles);
  readonly count = computed(() => this.state().bundles.length);

  readonly maxTags = MAX_BUNDLE_TAGS;

  private storageKey(): string {
    return scopedKey(STORAGE_BASE);
  }

  /** Read stored bundles, discarding (and logging) anything from another version. */
  private load(): TagBundleState {
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (!raw) {
        return { version: STATE_VERSION, bundles: [] };
      }
      const parsed = JSON.parse(raw) as Partial<TagBundleState> | null;
      if (parsed?.version !== STATE_VERSION) {
        this.diagnostics.info('TagBundles', 'cache:version-bust', {
          found: parsed?.version ?? null,
          expected: STATE_VERSION,
          discarded: Array.isArray(parsed?.bundles) ? parsed.bundles.length : 0,
        });
        return { version: STATE_VERSION, bundles: [] };
      }
      if (!Array.isArray(parsed.bundles)) {
        return { version: STATE_VERSION, bundles: [] };
      }
      return {
        version: STATE_VERSION,
        bundles: parsed.bundles
          .filter(
            (bundle): bundle is TagBundle =>
              typeof bundle?.id === 'string' &&
              typeof bundle.title === 'string' &&
              Array.isArray(bundle.tags),
          )
          // Re-normalized and re-capped on read: a hand-edited blob does not get to
          // hand this app an eleven-call feed.
          .map((bundle) => ({
            ...bundle,
            tags: cap(dedupe(bundle.tags.filter((t) => typeof t === 'string').map(normalizeTag))),
          })),
      };
    } catch {
      return { version: STATE_VERSION, bundles: [] };
    }
  }

  get(id: string): TagBundle | null {
    return this.bundles().find((bundle) => bundle.id === id) ?? null;
  }

  create(title: string, tags: string[] = []): TagBundle {
    const bundle: TagBundle = {
      id: `tag-bundle-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: title.trim(),
      tags: cap(dedupe(tags.map(normalizeTag))),
      createdAt: new Date().toISOString(),
    };
    this.persist([...this.bundles(), bundle]);
    this.diagnostics.info('TagBundles', 'bundle:create', {
      id: bundle.id,
      tags: bundle.tags.length,
    });
    return bundle;
  }

  rename(id: string, title: string): void {
    const next = title.trim();
    if (!next) {
      return;
    }
    this.persist(
      this.bundles().map((bundle) => (bundle.id === id ? { ...bundle, title: next } : bundle)),
    );
  }

  remove(id: string): void {
    this.persist(this.bundles().filter((bundle) => bundle.id !== id));
    this.diagnostics.info('TagBundles', 'bundle:remove', { id });
  }

  /** True when this bundle cannot take another tag. */
  isFull(id: string): boolean {
    return (this.get(id)?.tags.length ?? 0) >= MAX_BUNDLE_TAGS;
  }

  hasTag(id: string, tag: string): boolean {
    return this.get(id)?.tags.includes(normalizeTag(tag)) ?? false;
  }

  /** Bundles already containing this tag — drives the tag page's checkboxes. */
  bundlesWith(tag: string): TagBundle[] {
    const needle = normalizeTag(tag);
    return this.bundles().filter((bundle) => bundle.tags.includes(needle));
  }

  /**
   * Add a tag to a bundle. Returns false when it was refused, so a caller can say why
   * rather than appearing to succeed — a silently dropped tag is the worst outcome here.
   */
  addTag(id: string, tag: string): boolean {
    const name = normalizeTag(tag);
    const bundle = this.get(id);
    if (!name || !bundle || bundle.tags.includes(name)) {
      return false;
    }
    if (bundle.tags.length >= MAX_BUNDLE_TAGS) {
      this.diagnostics.info('TagBundles', 'bundle:full', { id, attempted: name });
      return false;
    }
    this.persist(this.bundles().map((b) => (b.id === id ? { ...b, tags: [...b.tags, name] } : b)));
    return true;
  }

  removeTag(id: string, tag: string): void {
    const name = normalizeTag(tag);
    this.persist(
      this.bundles().map((bundle) =>
        bundle.id === id ? { ...bundle, tags: bundle.tags.filter((t) => t !== name) } : bundle,
      ),
    );
  }

  /** Convenience for a checkbox: add or remove in one call. */
  setTag(id: string, tag: string, member: boolean): boolean {
    if (member) {
      return this.addTag(id, tag);
    }
    this.removeTag(id, tag);
    return true;
  }

  private persist(bundles: TagBundle[]): void {
    const state: TagBundleState = { version: STATE_VERSION, bundles };
    this.state.set(state);
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify(state));
    } catch (error: unknown) {
      this.diagnostics.error('TagBundles', 'persist:failed', error);
    }
  }
}

function dedupe(tags: string[]): string[] {
  return [...new Set(tags.filter(Boolean))];
}

function cap(tags: string[]): string[] {
  return tags.slice(0, MAX_BUNDLE_TAGS);
}
