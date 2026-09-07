import { inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Auth } from './auth';
import { AnonymousCapabilities } from './providers/anonymous/anonymous-capabilities';

/**
 * Global keyboard shortcuts, matching mastodon.social's bindings so nobody
 * has to learn a new layout (see Mastodon's components/hotkeys keymap):
 *
 * - singles: n (compose), s or / (search), j/k (move through posts),
 *   0 (first post), l (load more), backspace (back), ? (this help)
 * - combos:  alt+n (new post from anywhere), alt+pageup/pagedown (j/k)
 * - sequences: g then h/n/e/l/t/d/f/b/m/u/p/s (go to a page)
 *
 * Per-status keys (f, b, r, m, q, enter/o, p, e) live on the focused status
 * card itself — see StatusCard — and stop propagation so they never double
 * up with these.
 */
@Injectable({ providedIn: 'root' })
export class Hotkeys {
  private router = inject(Router);
  private auth = inject(Auth);
  private capabilities = inject(AnonymousCapabilities);

  /** The "?" keyboard-shortcut help dialog. */
  readonly helpOpen = signal(false);

  private started = false;
  private bufferedKeys: string[] = [];
  private bufferTimer: ReturnType<typeof setTimeout> | null = null;

  /** Install the document-level listener (idempotent; call from the shell). */
  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    document.addEventListener('keydown', (event) => this.onKeydown(event));
  }

  private onKeydown(event: KeyboardEvent): void {
    if (event.defaultPrevented) {
      return;
    }
    const target = event.target as HTMLElement;
    const tag = target.tagName?.toLowerCase() ?? '';
    if (['input', 'textarea', 'select'].includes(tag) || target.isContentEditable) {
      return;
    }
    const key = normalizeKey(event.key);
    if (['a', 'button'].includes(tag) && key === 'enter') {
      return;
    }

    const handled = this.dispatch(event, key);
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.bufferKey(key);
  }

  /** Returns true when the key did something (so default behaviour is eaten). */
  private dispatch(event: KeyboardEvent, key: string): boolean {
    // Sequences ("g" then a letter) outrank everything, like upstream.
    if (this.bufferedKeys.at(-1) === 'g' && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const path = this.goToPath(key);
      if (path) {
        void this.router.navigateByUrl(path);
        return true;
      }
    }

    // Option/alt combos (matched on code — alt remaps event.key on some layouts).
    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      switch (event.code) {
        case 'KeyN':
          void this.newPost(true);
          return true;
        case 'PageDown':
          return this.moveFocus(1);
        case 'PageUp':
          return this.moveFocus(-1);
      }
      return false;
    }

    if (event.ctrlKey || event.metaKey) {
      return false;
    }

    switch (key) {
      case '?':
        this.helpOpen.update((v) => !v);
        return true;
      case 'escape':
        if (this.helpOpen()) {
          this.helpOpen.set(false);
          return true;
        }
        return false;
      case 's':
      case '/':
        void this.router.navigateByUrl('/search');
        return true;
      case 'n':
        void this.newPost(false);
        return true;
      case 'backspace':
        history.back();
        return true;
      case 'j':
        return this.moveFocus(1);
      case 'k':
        return this.moveFocus(-1);
      case '0':
        return this.focusStatusAt(0);
      case 'l':
        return this.focusLoadMore();
    }
    return false;
  }

  /** Where a "g"-prefixed sequence goes; null for unmapped letters. */
  private goToPath(key: string): string | null {
    const me = this.auth.account()?.id;
    switch (key) {
      case 'h':
      case 's': // "start" — home is the closest thing we have
        return '/home';
      case 'n':
        if (this.capabilities.active) return null;
        return '/notifications';
      case 'e':
        // "explore" — the Feeds tab is the hub for all custom/server feeds.
        return '/feeds';
      case 'l':
        return '/feeds/local';
      case 't':
        return '/feeds/federated';
      case 'd':
        if (this.capabilities.active) return null;
        return '/conversations';
      case 'f':
        if (this.capabilities.active) return null;
        return '/favourites';
      case 'b':
        if (this.capabilities.active) return null;
        return '/settings/blocks';
      case 'm':
        if (this.capabilities.active) return null;
        return '/settings/mutes';
      case 'u':
      case 'p': // pinned posts live on the profile
        return me ? `/accounts/${me}` : null;
      default:
        return null;
    }
  }

  /** Focus the page's composer; from pages without one, go home first. */
  private async newPost(force: boolean): Promise<void> {
    if (!this.capabilities.canCompose) {
      return;
    }
    if (!this.focusComposer() || force) {
      if (!document.querySelector('.compose textarea')) {
        await this.router.navigateByUrl('/home');
        // The home page renders on the next tick; retry briefly.
        setTimeout(() => this.focusComposer(), 100);
        setTimeout(() => this.focusComposer(), 400);
      } else {
        this.focusComposer();
      }
    }
  }

  private focusComposer(): boolean {
    const box = document.querySelector<HTMLTextAreaElement>('.compose textarea');
    if (!box) {
      return false;
    }
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
    box.scrollIntoView({ block: 'center' });
    return true;
  }

  // --- j/k focus movement over status cards ---

  private statusCards(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('article.status[tabindex]'));
  }

  private moveFocus(delta: number): boolean {
    const cards = this.statusCards();
    if (!cards.length) {
      return false;
    }
    const current = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(
      'article.status',
    );
    const index = current ? cards.indexOf(current) : -1;
    const next = index === -1 ? (delta > 0 ? 0 : cards.length - 1) : index + delta;
    return this.focusStatusAt(Math.max(0, Math.min(cards.length - 1, next)));
  }

  private focusStatusAt(index: number): boolean {
    const card = this.statusCards()[index];
    if (!card) {
      return false;
    }
    card.focus();
    card.scrollIntoView({ block: 'center' });
    return true;
  }

  private focusLoadMore(): boolean {
    const btn = document.querySelector<HTMLButtonElement>('button.more');
    if (!btn) {
      return false;
    }
    btn.focus();
    btn.scrollIntoView({ block: 'center' });
    return true;
  }

  private bufferKey(key: string): void {
    this.bufferedKeys.push(key);
    if (this.bufferedKeys.length > 10) {
      this.bufferedKeys.shift();
    }
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
    }
    this.bufferTimer = setTimeout(() => {
      this.bufferedKeys = [];
    }, 1000);
  }
}

function normalizeKey(key: string): string {
  return key === ' ' ? 'space' : key.toLowerCase();
}
