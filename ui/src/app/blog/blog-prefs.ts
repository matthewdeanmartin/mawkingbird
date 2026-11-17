import { computed, Injectable, signal } from '@angular/core';
import { BlogThresholds, clampThresholds, DEFAULT_BLOG_THRESHOLDS } from './blog-classifier';

const PREFS_KEY = 'mockingbird_blog_prefs';

function read(): BlogThresholds {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
    return value && typeof value === 'object'
      ? clampThresholds(value as Partial<BlogThresholds>)
      : DEFAULT_BLOG_THRESHOLDS;
  } catch {
    return DEFAULT_BLOG_THRESHOLDS;
  }
}

/**
 * What counts as a blog post, as this reader has set it (Settings › Blog).
 *
 * Device-wide, not per account: it is a reading preference about everyone's
 * posts, the same on whichever identity is signed in.
 */
@Injectable({ providedIn: 'root' })
export class BlogPrefs {
  private readonly value = signal<BlogThresholds>(read());
  readonly thresholds = this.value.asReadonly();
  readonly isDefault = computed(
    () =>
      this.value().minPosts === DEFAULT_BLOG_THRESHOLDS.minPosts &&
      this.value().minChars === DEFAULT_BLOG_THRESHOLDS.minChars,
  );

  set(next: Partial<BlogThresholds>): void {
    const value = clampThresholds({ ...this.value(), ...next });
    this.value.set(value);
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(value));
    } catch {
      // The choice still holds for this page load without storage.
    }
  }

  reset(): void {
    this.value.set(DEFAULT_BLOG_THRESHOLDS);
    try {
      localStorage.removeItem(PREFS_KEY);
    } catch {
      // Nothing stored to remove, or nowhere to remove it from.
    }
  }
}
