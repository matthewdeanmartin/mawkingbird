import { DatePipe } from '@angular/common';
import { Component, Injectable, computed, inject, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import {
  NativePeopleCategory,
  NativeProfileSummary,
} from '../../platform/session/native-profile-types';

// i18n pages.algoPeople.noMembers: No people have matched with the evidence saved so far.
// i18n pages.homeProfiles.peopleGroups: Filter people

/** The routed reader owns this state; the shell's rail renders it. */
@Injectable({ providedIn: 'root' })
export class HomeProfilesRailState {
  readonly profiles = signal<NativeProfileSummary[]>([]);
  readonly selectedId = signal<number | null>(null);
  readonly category = signal<NativePeopleCategory>('all');
  readonly members = signal<Set<number> | null>(null);
  readonly visibleProfiles = computed(() => {
    const profiles = this.profiles();
    const members = this.members();
    return this.category() === 'all'
      ? profiles
      : members
        ? profiles.filter((p) => members.has(p.id))
        : [];
  });
  private owner: object | null = null;
  private selectProfile: ((id: number) => void) | null = null;
  private selectCategory: ((category: NativePeopleCategory) => void) | null = null;

  bind(
    owner: object,
    select: (id: number) => void,
    category: (value: NativePeopleCategory) => void,
  ): void {
    this.owner = owner;
    this.selectProfile = select;
    this.selectCategory = category;
    this.profiles.set([]);
    this.selectedId.set(null);
    this.category.set('all');
    this.members.set(null);
  }

  select(id: number): void {
    this.selectProfile?.(id);
  }

  chooseCategory(category: NativePeopleCategory): void {
    this.selectCategory?.(category);
  }

  release(owner: object): void {
    if (this.owner !== owner) return;
    this.owner = null;
    this.selectProfile = null;
    this.selectCategory = null;
    this.profiles.set([]);
    this.selectedId.set(null);
    this.category.set('all');
    this.members.set(null);
  }
}

@Component({
  selector: 'app-home-profiles-rail',
  imports: [DatePipe, TranslocoPipe],
  template: `
    <nav class="profile-list" [attr.aria-label]="'pages.homeProfiles.title' | transloco">
      <div class="list-heading">
        <h2>{{ 'pages.homeProfiles.title' | transloco }}</h2>
        <select
          [attr.aria-label]="'pages.homeProfiles.peopleGroups' | transloco"
          [value]="state.category()"
          (change)="state.chooseCategory($any($event.target).value)"
        >
          @for (category of categories; track category) {
            <option [value]="category" [selected]="state.category() === category">
              {{ 'pages.algoPeople.' + category | transloco }}
            </option>
          }
        </select>
      </div>
      @for (profile of state.visibleProfiles(); track profile.id) {
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
      @if (state.category() !== 'all' && state.members() && !state.visibleProfiles().length) {
        <p>{{ 'pages.algoPeople.noMembers' | transloco }}</p>
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
        margin: 0;
        font-size: 1rem;
      }
      .list-heading {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
        position: sticky;
        top: 0;
        z-index: 1;
        background: var(--col-bg);
      }
      .list-heading select {
        min-width: 0;
        max-width: 65%;
        color: var(--text);
        background: var(--col-bg);
        border: 1px solid var(--border);
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
  protected readonly categories: readonly NativePeopleCategory[] = [
    'all',
    'social',
    'mutuals',
    'reading',
    'readers',
    'bots',
    'lively',
    'zombies',
    'celebrities',
  ];
}
