import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { accountProfilePath } from '../../accounts/account-route';
import { MbButton } from '../../design-system/button/button';
import { adaptProfile } from '../../connections/bluesky/bluesky-adapter';
import { BlueskyGraph } from '../../connections/bluesky/bluesky-graph';
import { BlueskySession } from '../../connections/bluesky/bluesky-session';
import { BskyProfile } from '../../connections/bluesky/bluesky-types';

// i18n bskyPeople.follow: Follow
// i18n bskyPeople.following: Following
// i18n bskyPeople.followFailed: Couldn't follow {{name}} on Bluesky.

/**
 * Bluesky accounts with a Follow button each: a starter pack's members,
 * Bluesky's suggestions, or accounts similar to one you just followed.
 * Following state starts from what Bluesky reported and updates as you go.
 */
@Component({
  selector: 'app-bluesky-people-list',
  imports: [RouterLink, TranslocoPipe, MbButton],
  template: `
    <ul class="people">
      @for (person of people(); track person.did) {
        <li>
          <a class="person" [routerLink]="profilePath(person)">
            <img
              class="avatar"
              [src]="person.avatar || ''"
              alt=""
              loading="lazy"
              decoding="async"
            />
            <span class="names">
              <span class="name">{{ person.displayName || person.handle }}</span>
              <span class="muted small">&#64;{{ person.handle }}</span>
              @if (person.description) {
                <span class="bio muted small">{{ person.description }}</span>
              }
            </span>
          </a>
          @if (canFollow() && person.did !== viewerDid()) {
            <button
              mbButton
              type="button"
              size="small"
              [variant]="isFollowing(person) ? 'outline' : 'solid'"
              [disabled]="busy().has(person.did)"
              [attr.aria-pressed]="isFollowing(person)"
              (click)="toggle(person)"
            >
              {{ (isFollowing(person) ? 'bskyPeople.following' : 'bskyPeople.follow') | transloco }}
            </button>
          }
        </li>
      }
    </ul>
  `,
  styleUrl: './bluesky-people-list.css',
})
export class BlueskyPeopleList {
  private graph = inject(BlueskyGraph);
  private session = inject(BlueskySession);

  readonly people = input.required<BskyProfile[]>();
  /** Emitted after a follow, so a page can offer similar accounts. */
  readonly followed = output<BskyProfile>();
  readonly failed = output<string>();

  /** DIDs whose follow state changed here, true for following. */
  readonly overrides = signal(new Map<string, boolean>());
  protected readonly busy = signal(new Set<string>());
  protected readonly canFollow = computed(() => this.session.linked());
  protected readonly viewerDid = computed(() => this.session.session()?.did);

  protected profilePath(person: BskyProfile): (string | number)[] {
    return accountProfilePath(adaptProfile(person));
  }

  isFollowing(person: BskyProfile): boolean {
    return this.overrides().get(person.did) ?? !!person.viewer?.following;
  }

  /** Follow every listed account not already followed; returns how many were followed. */
  async followAll(): Promise<number> {
    let count = 0;
    for (const person of this.people()) {
      if (person.did === this.viewerDid() || this.isFollowing(person)) continue;
      if (await this.setFollowing(person, true)) count++;
    }
    return count;
  }

  protected async toggle(person: BskyProfile): Promise<void> {
    const follow = !this.isFollowing(person);
    if ((await this.setFollowing(person, follow)) && follow) this.followed.emit(person);
  }

  private async setFollowing(person: BskyProfile, follow: boolean): Promise<boolean> {
    this.busy.update((set) => new Set(set).add(person.did));
    try {
      await firstValueFrom(
        follow ? this.graph.follow(person.did) : this.graph.unfollow(person.did),
      );
      this.overrides.update((map) => new Map(map).set(person.did, follow));
      return true;
    } catch {
      this.failed.emit(person.displayName || person.handle);
      return false;
    } finally {
      this.busy.update((set) => {
        const next = new Set(set);
        next.delete(person.did);
        return next;
      });
    }
  }
}
