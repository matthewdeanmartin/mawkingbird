import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom, Observable } from 'rxjs';
import { Auth } from '../../platform/session/auth';
import { FeedSection } from './feed-sections';
import { MisskeyApi } from '../../connections/misskey/misskey-api';
import {
  MkHomeTimeline,
  MisskeyProvider,
  misskeyTimelinesFor,
} from '../../connections/misskey/misskey-provider';
import { MkAntenna, MkChannel, MkClip, MkUserList } from '../../connections/misskey/misskey-types';

// i18n pages.lists.misskey.timelines: Timelines
// i18n pages.lists.misskey.antennas: Antennas
// i18n pages.lists.misskey.lists: Misskey lists
// i18n pages.lists.misskey.channels: Channels
// i18n pages.lists.misskey.clips: Clips
// i18n pages.lists.misskey.timelinesHint: Opens on Home.
// i18n pages.lists.misskey.antennasHint: Antennas collect notes that match words or people you chose. Make and edit them on your Misskey server.
// i18n pages.lists.misskey.listsHint: Lists of people you made on your Misskey server.
// i18n pages.lists.misskey.clipsHint: Notes you saved into clips on your Misskey server.
// i18n pages.lists.misskey.followedChannels: Channels you follow
// i18n pages.lists.misskey.favoriteChannels: Favourite channels
// i18n pages.lists.misskey.featuredChannels: Featured on {{server}}
// i18n pages.lists.misskey.noAntennas: No antennas yet.
// i18n pages.lists.misskey.noLists: No lists yet.
// i18n pages.lists.misskey.noClips: No clips yet.
// i18n pages.lists.misskey.noChannels: No channels here yet.
// i18n pages.lists.misskey.loading: Loading…
// i18n pages.lists.misskey.failed: Could not load these from your Misskey server.
// i18n pages.lists.misskey.manage: Manage on {{server}}
// i18n pages.lists.misskey.visitorOnly: Antennas, lists and clips belong to a Misskey account. Sign in to use yours.
// i18n pages.lists.misskey.notes: {{count}} notes

/** One loaded group of feeds, with its own loading and failure state. */
interface Group<T> {
  items: T[];
  loading: boolean;
  failed: boolean;
}

const LOADING: Group<never> = { items: [], loading: true, failed: false };

/**
 * The Misskey sections of the Feeds page: the timelines, and the reader's
 * antennas, lists, channels and clips, each opening its own feed page
 * (`/misskey/:kind/:id`). Antennas, lists, clips and followed channels need
 * an account; the visitor gets the timelines and the server's featured
 * channels.
 *
 * A separate component so the shared Feeds page, which is Mastodon and
 * Bluesky shaped, only has to decide *whether* to show these.
 */
@Component({
  selector: 'app-misskey-feed-sections',
  imports: [NgTemplateOutlet, RouterLink, TranslocoPipe],
  template: `
    @if (shows('mk-timelines')) {
      <div class="section-head">{{ 'pages.lists.misskey.timelines' | transloco }}</div>
      <p class="muted small section-note">{{ 'pages.lists.misskey.timelinesHint' | transloco }}</p>
      @for (timeline of timelines(); track timeline) {
        <a class="list-row" routerLink="/home" (click)="chooseTimeline(timeline)">
          <span>{{ 'pages.home.misskey.timeline.' + timeline | transloco }}</span>
        </a>
      }
    }

    @if (shows('mk-antennas')) {
      <div class="section-head">{{ 'pages.lists.misskey.antennas' | transloco }}</div>
      @if (visitor()) {
        <p class="muted small section-note">{{ 'pages.lists.misskey.visitorOnly' | transloco }}</p>
      } @else {
        <p class="muted small section-note">{{ 'pages.lists.misskey.antennasHint' | transloco }}</p>
        <ng-container
          *ngTemplateOutlet="
            rows;
            context: { group: antennas(), kind: 'antenna', empty: 'noAntennas' }
          "
        />
        <ng-container *ngTemplateOutlet="manage; context: { path: '/my/antennas' }" />
      }
    }

    @if (shows('mk-lists')) {
      <div class="section-head">{{ 'pages.lists.misskey.lists' | transloco }}</div>
      @if (visitor()) {
        <p class="muted small section-note">{{ 'pages.lists.misskey.visitorOnly' | transloco }}</p>
      } @else {
        <p class="muted small section-note">{{ 'pages.lists.misskey.listsHint' | transloco }}</p>
        <ng-container
          *ngTemplateOutlet="rows; context: { group: lists(), kind: 'list', empty: 'noLists' }"
        />
        <ng-container *ngTemplateOutlet="manage; context: { path: '/my/lists' }" />
      }
    }

    @if (shows('mk-channels')) {
      <div class="section-head">{{ 'pages.lists.misskey.channels' | transloco }}</div>
      @if (!visitor()) {
        <h3 class="sub-head">{{ 'pages.lists.misskey.followedChannels' | transloco }}</h3>
        <ng-container
          *ngTemplateOutlet="
            rows;
            context: { group: followedChannels(), kind: 'channel', empty: 'noChannels' }
          "
        />
        @if (favoriteChannels().items.length) {
          <h3 class="sub-head">{{ 'pages.lists.misskey.favoriteChannels' | transloco }}</h3>
          <ng-container
            *ngTemplateOutlet="
              rows;
              context: { group: favoriteChannels(), kind: 'channel', empty: 'noChannels' }
            "
          />
        }
      }
      <h3 class="sub-head">
        {{ 'pages.lists.misskey.featuredChannels' | transloco: { server: host() } }}
      </h3>
      <ng-container
        *ngTemplateOutlet="
          rows;
          context: { group: featuredChannels(), kind: 'channel', empty: 'noChannels' }
        "
      />
    }

    @if (shows('mk-clips')) {
      <div class="section-head">{{ 'pages.lists.misskey.clips' | transloco }}</div>
      @if (visitor()) {
        <p class="muted small section-note">{{ 'pages.lists.misskey.visitorOnly' | transloco }}</p>
      } @else {
        <p class="muted small section-note">{{ 'pages.lists.misskey.clipsHint' | transloco }}</p>
        <ng-container
          *ngTemplateOutlet="rows; context: { group: clips(), kind: 'clip', empty: 'noClips' }"
        />
        <ng-container *ngTemplateOutlet="manage; context: { path: '/my/clips' }" />
      }
    }

    <ng-template #rows let-group="group" let-kind="kind" let-empty="empty">
      @if (group.loading) {
        <p class="muted center small">{{ 'pages.lists.misskey.loading' | transloco }}</p>
      } @else if (group.failed) {
        <p class="muted center small" role="alert">
          {{ 'pages.lists.misskey.failed' | transloco }}
        </p>
      } @else {
        @for (item of group.items; track item.id) {
          <a class="list-row" [routerLink]="['/misskey', kind, item.id]">
            <span>
              {{ item.name }}
              @if (item.notesCount) {
                <span class="muted small">
                  · {{ 'pages.lists.misskey.notes' | transloco: { count: item.notesCount } }}
                </span>
              }
            </span>
          </a>
        } @empty {
          <p class="muted center small">{{ 'pages.lists.misskey.' + empty | transloco }}</p>
        }
      }
    </ng-template>

    <ng-template #manage let-path="path">
      <p class="manage small">
        <a [href]="server() + path" target="_blank" rel="noopener noreferrer">{{
          'pages.lists.misskey.manage' | transloco: { server: host() }
        }}</a>
      </p>
    </ng-template>
  `,
  styles: `
    :host {
      display: block;
    }
    .section-head {
      padding: 14px 16px 6px;
      font-size: 16px;
      font-weight: 800;
      border-top: 1px solid var(--border);
      margin-top: 12px;
    }
    .sub-head {
      margin: 8px 16px 4px;
      font-size: 14px;
    }
    .section-note,
    .manage {
      margin: 0 16px 8px;
    }
    p.muted.center.small {
      padding: 8px 16px;
      text-align: left;
    }
    .list-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      width: 100%;
    }
  `,
})
export class MisskeyFeedSections implements OnInit {
  private api = inject(MisskeyApi);
  private auth = inject(Auth);
  private provider = inject(MisskeyProvider);

  /** The Feeds page's chosen section, or `all`. */
  readonly section = input<FeedSection | 'all'>('all');

  protected readonly visitor = computed(() => this.auth.isMisskeyVisitor);
  protected readonly timelines = computed(() => misskeyTimelinesFor(this.auth.activeMisskeyKey()));
  protected readonly server = computed(() => {
    const url = this.auth.account()?.url ?? '';
    try {
      return new URL(url).origin;
    } catch {
      return '';
    }
  });
  protected readonly host = computed(() => {
    try {
      return new URL(this.server()).host;
    } catch {
      return '';
    }
  });

  protected antennas = signal<Group<MkAntenna>>(LOADING);
  protected lists = signal<Group<MkUserList>>(LOADING);
  protected followedChannels = signal<Group<MkChannel>>(LOADING);
  protected favoriteChannels = signal<Group<MkChannel>>(LOADING);
  protected featuredChannels = signal<Group<MkChannel>>(LOADING);
  protected clips = signal<Group<MkClip>>(LOADING);

  protected shows(section: FeedSection): boolean {
    return this.section() === 'all' || this.section() === section;
  }

  ngOnInit(): void {
    void this.fill(this.featuredChannels, this.api.featuredChannels());
    if (this.visitor()) return;
    void this.fill(this.antennas, this.api.antennas());
    void this.fill(this.lists, this.api.userLists());
    void this.fill(this.followedChannels, this.api.followedChannels());
    void this.fill(this.favoriteChannels, this.api.favoriteChannels());
    void this.fill(this.clips, this.api.clips());
  }

  /** A timeline is Home's: the link goes there, having chosen it first. */
  protected chooseTimeline(timeline: MkHomeTimeline): void {
    this.provider.setTimeline(timeline);
  }

  private async fill<T>(
    target: ReturnType<typeof signal<Group<T>>>,
    source: Observable<T[]>,
  ): Promise<void> {
    try {
      const items = await firstValueFrom(source);
      target.set({ items: Array.isArray(items) ? items : [], loading: false, failed: false });
    } catch {
      target.set({ items: [], loading: false, failed: true });
    }
  }
}
