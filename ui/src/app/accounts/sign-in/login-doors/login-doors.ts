import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { FeatureFlags } from '../../../platform/build/feature-flags';

type Network = 'mastodon' | 'bluesky' | 'misskey';

interface Door {
  network: Network;
  badge: string;
  nameKey: string;
  hintKey: string;
}

const DOORS: readonly Door[] = [
  {
    network: 'mastodon',
    badge: '🐘',
    nameKey: 'loginChooser.mastodon',
    hintKey: 'loginChooser.mastodonHint',
  },
  {
    network: 'bluesky',
    badge: '🦋',
    nameKey: 'loginChooser.bluesky',
    hintKey: 'loginChooser.blueskyHint',
  },
  {
    network: 'misskey',
    badge: 'Ⓜ️',
    nameKey: 'loginChooser.misskey',
    hintKey: 'loginChooser.misskeyHint',
  },
];

/**
 * The one "which network is your account on?" choice: the `/login` page and
 * the Add account dialog both show exactly this, so a new network appears in
 * every way in at once. Misskey follows its rollout flag.
 *
 * `reload` makes each door a plain link: adding an account from inside a
 * signed-in shell must boot the login page fresh, as the old menu entries did.
 */
@Component({
  selector: 'app-login-doors',
  imports: [NgTemplateOutlet, RouterLink, TranslocoPipe],
  template: `
    <div class="doors">
      @for (door of doors; track door.network) {
        @if (reload()) {
          <a class="door" [href]="'login/' + door.network + (adding() ? '?add=1' : '')">
            <ng-container *ngTemplateOutlet="body; context: { $implicit: door }" />
          </a>
        } @else {
          <a
            class="door"
            [routerLink]="'/login/' + door.network"
            [queryParams]="queryParams()"
          >
            <ng-container *ngTemplateOutlet="body; context: { $implicit: door }" />
          </a>
        }
      }
    </div>
    <ng-template #body let-door>
      <span class="door-badge" aria-hidden="true">{{ door.badge }}</span>
      <span class="door-body">
        <span class="door-name">{{ door.nameKey | transloco }}</span>
        <span class="door-hint muted small">{{ door.hintKey | transloco }}</span>
      </span>
    </ng-template>
  `,
  styleUrl: './login-doors.css',
})
export class LoginDoors {
  /** Carry `?add=1`, so the login page does not bounce a signed-in user home. */
  readonly adding = input(false);
  readonly next = input<string | null>(null);
  protected readonly queryParams = computed(() => ({
    ...(this.adding() ? { add: 1 } : {}),
    ...(this.next() ? { next: this.next() } : {}),
  }));
  readonly reload = input(false);
  private readonly misskey = inject(FeatureFlags).enabled('misskey');
  protected readonly doors = DOORS.filter((door) => door.network !== 'misskey' || this.misskey);
}
