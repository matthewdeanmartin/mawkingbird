import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { Auth } from '../../auth';
import { BulkActions, BulkTarget } from '../../bulk-actions';
import { BulkActionsDialog } from '../../bulk-actions-dialog/bulk-actions-dialog';
import { BulkProgress } from '../../bulk-progress/bulk-progress';
import { MbBadge } from '../../design-system/badge/badge';
import { MbButton } from '../../design-system/button/button';
import { MbRailCard } from '../../design-system/identity/rail-card';
import { FollowButton } from '../../follow-button/follow-button';
import { personKey } from '../../forum/discussion';
import { facetParams, mostActive, toggleFacet } from '../../forum/discussion-facets';
import { ForumScan } from '../../forum/forum-scan';
import { ForumView } from '../../forum/forum-view';
import { HumanTimePipe } from '../../human-time.pipe';
import { Account } from '../../models';
import { ForumListDialog } from './forum-list-dialog';

// i18n forum.members.rail: People in this discussion
// i18n forum.members.inDiscussion: In this discussion
// i18n forum.members.mostActive: Most active
// i18n forum.members.empty: People appear here once discussions are found.
// i18n forum.members.unscanned: Open this discussion from a Forum scan to see who is in it.
// i18n forum.members.started: Started it
// i18n forum.members.you: You
// i18n forum.members.following: Following
// i18n forum.members.postsOne: 1 post
// i18n forum.members.postsOther: {{count}} posts
// i18n forum.members.last: last {{time}}
// i18n forum.members.inOne: in 1 discussion
// i18n forum.members.inOther: in {{count}} discussions
// i18n forum.members.filter: Show discussions with {{name}}
// i18n forum.members.profileOf: {{name}}’s profile
// i18n forum.members.followAll: Follow everyone
// i18n forum.members.addToList: Add everyone to a list

/** One row of the rail, whichever mode it is in. */
interface MemberRow {
  person: string;
  account: Account;
  /** My server's record: follow and lists can act on it directly. */
  local: boolean;
  /** Short facts shown after the handle, each a translation key and its values. */
  detail: { key: string; params: Record<string, unknown> }[];
  started: boolean;
}

/**
 * Forum's right rail, "who is in this discussion", in place of ads and server
 * cards (spec/forum.md). Beside a discussion it lists everyone in it, with
 * Follow everyone and Add everyone to a list. Beside the list it shows who is
 * most active across what is visible. Choosing a person narrows the list to
 * discussions they are in (the People facet).
 */
@Component({
  selector: 'app-forum-members',
  imports: [
    RouterLink,
    TranslocoPipe,
    MbBadge,
    MbButton,
    MbRailCard,
    FollowButton,
    BulkActionsDialog,
    BulkProgress,
    ForumListDialog,
  ],
  template: `
    <section mbRailCard class="card">
      <h2 class="card-title">
        {{
          (inDiscussion() ? 'forum.members.inDiscussion' : 'forum.members.mostActive') | transloco
        }}
      </h2>
      <ul class="people">
        @for (row of rows(); track row.person) {
          <li [class.chosen]="chosen(row.person)">
            @if (row.local) {
              <a
                class="avatar"
                [routerLink]="['/accounts', row.account.id]"
                [attr.aria-label]="
                  'forum.members.profileOf' | transloco: { name: name(row.account) }
                "
              >
                <img
                  [src]="row.account.avatar_static || row.account.avatar"
                  alt=""
                  loading="lazy"
                />
              </a>
            } @else {
              <a
                class="avatar"
                [href]="row.account.url"
                target="_blank"
                rel="noopener noreferrer"
                [attr.aria-label]="
                  'forum.members.profileOf' | transloco: { name: name(row.account) }
                "
              >
                <img
                  [src]="row.account.avatar_static || row.account.avatar"
                  alt=""
                  loading="lazy"
                />
              </a>
            }
            <button
              type="button"
              class="who"
              [attr.aria-pressed]="chosen(row.person)"
              [title]="'forum.members.filter' | transloco: { name: name(row.account) }"
              (click)="toggle(row.person)"
            >
              <span class="line">
                <span class="name">{{ name(row.account) }}</span>
                @if (row.started) {
                  <mb-badge>{{ 'forum.members.started' | transloco }}</mb-badge>
                }
                @if (row.person === me()) {
                  <mb-badge>{{ 'forum.members.you' | transloco }}</mb-badge>
                } @else if (scan.following().has(row.person)) {
                  <mb-badge>{{ 'forum.members.following' | transloco }}</mb-badge>
                }
              </span>
              <!-- Counts first: a long handle truncates, the counts never do. -->
              <span class="detail muted">
                @for (part of row.detail; track part.key) {
                  {{ part.key | transloco: part.params }} ·
                }
                &#64;{{ row.account.acct }}
              </span>
            </button>
            @if (row.person !== me()) {
              <app-follow-button
                [accountId]="row.account.id"
                [handle]="row.account.acct"
                [foreign]="row.local ? null : row.account"
              />
            }
          </li>
        } @empty {
          <li class="note muted">
            {{ (inDiscussion() ? 'forum.members.unscanned' : 'forum.members.empty') | transloco }}
          </li>
        }
      </ul>
      @if (focused() && others().length) {
        <div class="actions">
          <button
            mbButton
            type="button"
            variant="compact"
            [disabled]="bulk.running()"
            (click)="followAllOpen.set(true)"
          >
            {{ 'forum.members.followAll' | transloco }}
          </button>
          <button mbButton type="button" variant="compact" (click)="listOpen.set(true)">
            {{ 'forum.members.addToList' | transloco }}
          </button>
        </div>
      }
      <div class="progress"><app-bulk-progress /></div>
    </section>

    @if (followAllOpen() && followTarget(); as target) {
      <app-bulk-actions-dialog
        action="list-follow"
        [target]="target"
        (confirmed)="followAll(target)"
        (cancelled)="followAllOpen.set(false)"
      />
    }
    @if (listOpen()) {
      <app-forum-list-dialog [accounts]="others()" (closed)="listOpen.set(false)" />
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .card {
      margin-bottom: 12px;
    }
    .people {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      display: grid;
      grid-template-columns: 32px minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      padding: 8px 14px 8px 11px;
      border-bottom: 1px solid var(--border);
      border-inline-start: 3px solid transparent;
    }
    li:last-child {
      border-bottom: none;
    }
    li.chosen {
      border-inline-start-color: var(--accent);
    }
    li.note {
      display: block;
      font-size: 13px;
    }
    .avatar img {
      display: block;
      width: 32px;
      height: 32px;
      border-radius: 50%;
    }
    .who {
      display: grid;
      gap: 1px;
      min-width: 0;
      padding: 0;
      border: 0;
      background: none;
      color: var(--text);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .who:hover .name {
      text-decoration: underline;
    }
    .line {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
      white-space: nowrap;
    }
    .name {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-weight: 700;
    }
    .detail {
      overflow: hidden;
      font-size: 12px;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding: 10px 14px;
      border-top: 1px solid var(--border);
    }
    .progress:not(:empty) {
      padding: 0 14px;
    }
  `,
})
export class ForumMembers {
  protected scan = inject(ForumScan);
  protected bulk = inject(BulkActions);
  private view = inject(ForumView);
  private auth = inject(Auth);
  private router = inject(Router);

  protected followAllOpen = signal(false);
  protected listOpen = signal(false);

  protected me = computed(() => {
    const account = this.auth.account();
    return account ? personKey(account) : null;
  });
  /** A discussion is open beside the rail, found by the scan or not. */
  protected inDiscussion = computed(() => this.view.focus() !== null);
  protected focused = computed(() => {
    const id = this.view.focus();
    return id === null
      ? null
      : (this.scan
          .summaries()
          .find((summary) => summary.discussion.key === this.scan.containing(id)?.key) ?? false);
  });

  protected rows = computed<MemberRow[]>(() => {
    const summary = this.focused();
    if (summary) {
      const starter = personKey(summary.discussion.anchor.account);
      return summary.participants.map((participant) => ({
        person: personKey(participant.account),
        account: participant.account,
        local: participant.local,
        started: personKey(participant.account) === starter,
        detail: [
          this.count('forum.members.posts', participant.posts),
          { key: 'forum.members.last', params: { time: this.time(participant.lastAt) } },
        ],
      }));
    }
    if (summary === false) return [];
    const local = new Set(
      this.view
        .visible()
        .flatMap((each) => each.participants)
        .filter((participant) => participant.local)
        .map((participant) => personKey(participant.account)),
    );
    return mostActive(this.view.visible()).map((person) => ({
      person: person.person,
      account: person.account,
      local: local.has(person.person),
      started: false,
      detail: [
        this.count('forum.members.in', person.discussions),
        this.count('forum.members.posts', person.posts),
      ],
    }));
  });

  /** Everyone in the discussion but me, as my server knows them. */
  protected others = computed<Account[]>(() => {
    const summary = this.focused();
    if (!summary) return [];
    const me = this.me();
    return summary.participants
      .filter((participant) => participant.local && personKey(participant.account) !== me)
      .map((participant) => participant.account);
  });

  protected followTarget = computed<BulkTarget | undefined>(() => {
    const summary = this.focused();
    if (!summary) return undefined;
    return {
      listId: summary.discussion.key,
      listTitle: this.name(summary.discussion.anchor.account),
      kind: 'discussion',
      accounts: this.others(),
    };
  });

  private timePipe = new HumanTimePipe();

  private time(iso: string): string {
    return this.timePipe.transform(iso);
  }

  /** A count's singular or plural phrase. */
  private count(base: string, count: number) {
    return { key: `${base}${count === 1 ? 'One' : 'Other'}`, params: { count } };
  }

  protected name(account: Account): string {
    return account.display_name || account.username || account.acct;
  }

  protected chosen(person: string): boolean {
    return this.view.choice().person.includes(person);
  }

  protected toggle(person: string): void {
    void this.router.navigate(['/forum'], {
      queryParams: {
        ...this.scan.listParams,
        ...facetParams(toggleFacet(this.view.choice(), 'person', person)),
      },
    });
  }

  protected followAll(target: BulkTarget): void {
    this.followAllOpen.set(false);
    // Not awaited: the progress panel reports it, and the reader may leave.
    void this.bulk.start('list-follow', target);
  }
}
