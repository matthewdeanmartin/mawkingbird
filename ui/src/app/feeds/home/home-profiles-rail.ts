import { DatePipe } from '@angular/common';
import { Component, Injectable, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { NativeProfileSummary } from '../../platform/session/native-profile-types';

/** The routed reader owns this state; the shell's rail renders it. */
@Injectable({ providedIn: 'root' })
export class HomeProfilesRailState {
  readonly profiles = signal<NativeProfileSummary[]>([]);
  readonly selectedId = signal<number | null>(null);
  private owner: object | null = null;
  private selectProfile: ((id: number) => void) | null = null;

  bind(owner: object, select: (id: number) => void): void {
    this.owner = owner;
    this.selectProfile = select;
    this.profiles.set([]);
    this.selectedId.set(null);
  }

  select(id: number): void {
    this.selectProfile?.(id);
  }

  release(owner: object): void {
    if (this.owner !== owner) return;
    this.owner = null;
    this.selectProfile = null;
    this.profiles.set([]);
    this.selectedId.set(null);
  }
}

@Component({
  selector: 'app-home-profiles-rail',
  imports: [DatePipe, TranslocoPipe],
  template: `
    <nav class="profile-list" [attr.aria-label]="'pages.homeProfiles.title' | transloco">
      <h2>{{ 'pages.homeProfiles.title' | transloco }}</h2>
      @for (profile of state.profiles(); track profile.id) {
        <button
          type="button"
          [class.selected]="state.selectedId() === profile.id"
          [attr.aria-current]="state.selectedId() === profile.id ? 'true' : null"
          (click)="state.select(profile.id)"
        >
          <strong>{{ profile.displayName || profile.acct }}</strong>
          <span>@{{ profile.acct }}</span>
          @if (profile.lastStatusAt) {
            <time [attr.datetime]="profile.lastStatusAt">{{
              profile.lastStatusAt | date: 'mediumDate'
            }}</time>
          }
          <small
            >{{ 'pages.homeProfiles.unread' | transloco: { count: profile.cachedUnread } }} ·
            {{ 'pages.homeProfiles.postCount' | transloco: { count: profile.cachedPosts } }}</small
          >
        </button>
      }
    </nav>
  `,
  styles: [
    `
      .profile-list {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 12px 0;
      }
      .profile-list h2 {
        margin: 0 0 8px;
        font-size: 1rem;
      }
      .profile-list button {
        text-align: left;
        border: 1px solid var(--border-color, #888);
        border-radius: 6px;
        background: transparent;
        color: inherit;
        padding: 8px;
      }
      .profile-list button.selected {
        outline: 2px solid currentColor;
      }
      .profile-list span,
      .profile-list small,
      .profile-list time {
        display: block;
        overflow-wrap: anywhere;
      }
    `,
  ],
})
export class HomeProfilesRail {
  protected readonly state = inject(HomeProfilesRailState);
}
