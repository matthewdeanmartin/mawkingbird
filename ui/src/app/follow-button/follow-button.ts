import { Component, computed, inject, input, output, signal } from '@angular/core';
import { Auth } from '../auth';
import { FollowState } from '../follow-state';
import { Account } from '../models';

/**
 * The follow control for one account, wherever a list of people is rendered.
 *
 * Deliberately small and stateless: everything it knows comes from
 * {@link FollowState}, so a follow made here shows up on every other row for
 * the same person without a refetch, and a list of forty people costs one
 * relationships request rather than forty.
 *
 * ## What it renders, and what it doesn't
 *
 * Nothing at all for an anonymous viewer, for yourself, or before the
 * relationship has resolved. A button that 401s is worse than no button, and a
 * "Follow" that turns out to say "Following" a moment later teaches people not
 * to trust it.
 *
 * `requested` is its own state rather than being folded into "Following":
 * following a locked account is a request they can decline, and telling
 * someone they succeeded at that is simply wrong.
 */
@Component({
  selector: 'app-follow-button',
  imports: [],
  template: `
    @if (visible()) {
      <button
        class="btn btn-sm follow-btn"
        [class.btn-outline]="!connected()"
        [class.following]="connected()"
        type="button"
        [disabled]="busy()"
        [attr.aria-label]="label() + ' ' + handle()"
        (click)="toggle($event)"
      >
        {{ busy() ? '…' : label() }}
      </button>
      @if (error()) {
        <span class="follow-error small" role="alert">{{ error() }}</span>
      }
    }
  `,
  styles: `
    .follow-btn {
      white-space: nowrap;
    }
    /* Hovering an established follow offers to undo it, so the label changes
       under the cursor and the button reads as destructive. */
    .follow-btn.following:hover {
      border-color: var(--danger, #c0392b);
      color: var(--danger, #c0392b);
    }
    .follow-error {
      margin-left: 6px;
      color: var(--danger, #c0392b);
    }
  `,
})
export class FollowButton {
  private auth = inject(Auth);
  private follows = inject(FollowState);

  readonly accountId = input.required<string>();
  /** For the accessible label — "Follow @alice" beats forty identical "Follow"s. */
  readonly handle = input('');

  /**
   * Set when this account came from somewhere other than the home server (a
   * shipped starter kit), so its id is not one this server can act on.
   *
   * Given one, the button appears immediately as "Follow" and webfingers the
   * account on click — see {@link FollowState.resolveForeign}. Without this,
   * the row simply has no button, which is what shipped kits used to get.
   */
  readonly foreign = input<Account | null>(null);

  /** The id to actually write to: the resolved local one when foreign. */
  private readonly resolvedId = signal<string | null>(null);

  /** Whichever id this button operates on, once it is known. */
  protected readonly targetId = computed(() =>
    this.foreign() ? this.resolvedId() : this.accountId(),
  );

  /** Emitted after a successful write, so a page can re-count or re-sort. */
  readonly changed = output<void>();

  protected readonly error = signal('');
  /** Webfingering a foreign account, before the follow itself. */
  private readonly resolving = signal(false);

  protected readonly status = computed(() => {
    const id = this.targetId();
    return id ? this.follows.status(id) : 'unknown';
  });

  protected readonly busy = computed(() => {
    const id = this.targetId();
    return this.resolving() || (!!id && this.follows.busyWith(id));
  });

  /** Following or requested — either way, the next click withdraws it. */
  protected readonly connected = computed(
    () => this.status() === 'following' || this.status() === 'requested',
  );

  /**
   * A foreign account whose local record has not been looked up yet.
   *
   * Its button *is* shown, reading "Follow", and the webfinger happens on the
   * click. Resolving all of them on mount would fire one search per row — 24
   * requests to open a starter kit, most of them for people the visitor will
   * never click — which is a worse deal than the one round-trip of latency the
   * first click now costs.
   */
  protected readonly unresolvedForeign = computed(() => !!this.foreign() && !this.resolvedId());

  protected readonly visible = computed(
    () =>
      !this.auth.isAnonymous &&
      this.targetId() !== this.auth.account()?.id &&
      (this.status() !== 'unknown' || this.unresolvedForeign()),
  );

  protected readonly label = computed(() => {
    switch (this.status()) {
      case 'following':
        return 'Following';
      case 'requested':
        return 'Requested';
      default:
        return 'Follow';
    }
  });

  protected async toggle(event: Event): Promise<void> {
    // These buttons sit inside rows that link to the profile.
    event.stopPropagation();
    event.preventDefault();
    this.error.set('');

    // A foreign account is webfingered here rather than on mount, so the cost
    // is paid by the row that was actually clicked.
    let id = this.targetId();
    if (!id) {
      const account = this.foreign();
      if (!account) {
        return;
      }
      this.resolving.set(true);
      const local = await this.follows.resolveForeign(account);
      this.resolving.set(false);
      if (!local) {
        this.error.set("Couldn't find that account on this server.");
        return;
      }
      this.resolvedId.set(local.id);
      id = local.id;
      // Now that they have a local id, find out whether we already follow them
      // — the answer decides whether this click follows or unfollows.
      await this.follows.resolve([id]);
      if (this.status() !== 'not-following') {
        // Already followed (or requested): this click has become a no-op that
        // would otherwise undo a relationship the user never saw.
        return;
      }
    }

    const ok = await this.follows.toggle(id);
    if (!ok) {
      this.error.set(
        id.startsWith('bsky:')
          ? "Couldn't update this follow on Bluesky — your link may have expired. Re-link in Settings → Connections."
          : "Couldn't update this follow on Mastodon — try again.",
      );
      return;
    }
    this.changed.emit();
  }
}
