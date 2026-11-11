import { Component, computed, input } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { accountProfilePath } from '../../../account-route';
import { Account } from '../../../models';

// i18n pages.profile.familiar.label: Followed by people you follow
// i18n pages.profile.familiar.more: and {{count}} more you follow
// i18n pages.profile.familiar.hint: People you follow who also follow this account. This is not the same as following each other.

/** How many familiar followers are named before the rest become a count. */
const NAMED = 3;

/**
 * "Followed by Alice, Bob and 4 more you follow": people the viewer follows who
 * follow this account (Mastodon's familiar followers). Each name opens that
 * person's profile.
 */
@Component({
  selector: 'app-familiar-followers',
  imports: [NgOptimizedImage, RouterLink, TranslocoPipe],
  template: `
    @if (accounts().length) {
      <section
        class="familiar"
        [attr.aria-label]="'pages.profile.familiar.label' | transloco"
        [title]="'pages.profile.familiar.hint' | transloco"
      >
        <span class="avatars" aria-hidden="true">
          @for (a of named(); track a.id) {
            <img
              [ngSrc]="a.avatar_static || a.avatar || 'favicon-32x32.png'"
              alt=""
              width="22"
              height="22"
            />
          }
        </span>
        <span class="text">
          {{ 'pages.profile.familiar.label' | transloco }}:
          @for (a of named(); track a.id; let last = $last) {
            <a [routerLink]="path(a)">{{ a.display_name || a.username }}</a
            >{{ last ? '' : ', ' }}
          }
          @if (rest() > 0) {
            {{ 'pages.profile.familiar.more' | transloco: { count: rest() } }}
          }
        </span>
      </section>
    }
  `,
  styles: `
    .familiar {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
      font-size: 14px;
      color: var(--muted);
    }
    .avatars {
      display: inline-flex;
      flex-shrink: 0;
    }
    .avatars img {
      border-radius: 50%;
      border: 2px solid var(--col-bg);
      margin-inline-start: -6px;
    }
    .avatars img:first-child {
      margin-inline-start: 0;
    }
    .text {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    a {
      color: var(--text);
      font-weight: 600;
      text-decoration: none;
    }
    a:hover,
    a:focus-visible {
      text-decoration: underline;
    }
  `,
})
export class FamiliarFollowers {
  readonly accounts = input<Account[]>([]);
  protected readonly named = computed(() => this.accounts().slice(0, NAMED));
  protected readonly rest = computed(() => Math.max(0, this.accounts().length - NAMED));
  protected readonly path = accountProfilePath;
}
