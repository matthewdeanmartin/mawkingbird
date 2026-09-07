import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Auth } from '../../../auth';
import { HumanCountPipe } from '../../../human-count.pipe';
import { VerifiedBadge } from '../../../verified-badge/verified-badge';
import { scopedKey } from '../../../account-scope';
import { RailProfile } from './rail-profile';
import { RailProfiles } from './rail-profiles';
import { TranslocoPipe } from '@jsverse/transloco';

// i18n shell.profile.active: active
// i18n shell.profile.show: Show {{network}} profile for {{name}}
// i18n shell.profile.viewProfile: View profile →
// i18n shell.profile.viewOn: View on {{network}} →
// i18n shell.profile.switch: Switch to this account

const SELECTED_KEY_BASE = 'mockingbird_rail_profile';

function loadSelected(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * The top of the left rail: every connected identity as a deck of cards, the
 * chosen one open and the rest peeking above it. Clicking a peeking tab deals
 * that card to the front.
 *
 * The choice is remembered per account, because which network you think of as
 * "yours" is a stable preference — and losing it on every reload would make the
 * deck feel like it resets itself.
 */
@Component({
  selector: 'app-profile-stack',
  imports: [RouterLink, VerifiedBadge, HumanCountPipe, TranslocoPipe],
  templateUrl: './profile-stack.html',
  styleUrl: './profile-stack.css',
})
export class ProfileStack implements OnInit {
  private railProfiles = inject(RailProfiles);
  private auth = inject(Auth);

  private readonly storageKey = scopedKey(SELECTED_KEY_BASE);
  private chosen = signal<string | null>(loadSelected(this.storageKey));

  protected profiles = this.railProfiles.profiles;

  /** The open card: the remembered one while it still exists, else the first. */
  protected selected = computed<RailProfile | null>(() => {
    const cards = this.profiles();
    const key = this.chosen();
    return cards.find((card) => card.key === key) ?? cards[0] ?? null;
  });

  /** The tabs above the open card, in stack order. */
  protected peeks = computed(() => this.profiles().filter((card) => card !== this.selected()));

  ngOnInit(): void {
    this.railProfiles.load();
  }

  select(key: string): void {
    this.chosen.set(key);
    try {
      localStorage.setItem(this.storageKey, key);
    } catch {
      // A card choice isn't worth failing over when storage is unavailable.
    }
  }

  /** Stat rows are laid out to however many figures the network reports. */
  statColumns(card: RailProfile): string {
    return `repeat(${card.stats.length}, minmax(0, 1fr))`;
  }

  /**
   * Make the browser-local identity the active one. A full reload for the same
   * reason the account menu does it: account-scoped state is read at
   * construction all over the app, so only a re-bootstrap is honest.
   */
  switchToLocal(): void {
    this.auth.enterAnonymous();
    location.reload();
  }
}
