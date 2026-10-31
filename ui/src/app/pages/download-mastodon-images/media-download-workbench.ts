import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Account, Status } from '../../models';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbNotice } from '../../design-system/notice/notice';
import { ProfileMediaGrid } from '../profile/media/profile-media-grid';
import { ProfileMediaItem, buildMediaItems } from '../profile/media/profile-media-item';
import { MediaDownloadDialog, MediaPageLoader } from '../../media-download/media-download-dialog';
import { FocusedNextSteps, NextStepCard } from '../focused-apps/focused-next-steps';
import { AccountSource, AccountSources, pagingId, parseAccountInput } from './account-source';

/** `user@host`, even for an account local to the server it was found on. */
function qualified(account: Account): string {
  if (account.acct.includes('@')) return account.acct;
  try {
    return `${account.acct}@${new URL(account.url).host}`;
  } catch {
    return account.acct;
  }
}

/** Posts per request; Mastodon's maximum. */
const PAGE = 40;

/**
 * The body of /download-mastodon-images: find an account, see its pictures,
 * download them. Works signed out — everything it reads is public.
 *
 * The account being shown is kept in `?acct=`, so a result can be shared or
 * reloaded.
 */
@Component({
  selector: 'app-media-download-workbench',
  imports: [
    FormsModule,
    MbButton,
    MbControl,
    MbField,
    MbDialog,
    MbNotice,
    ProfileMediaGrid,
    MediaDownloadDialog,
    FocusedNextSteps,
  ],
  templateUrl: './media-download-workbench.html',
  styleUrl: '../focused-apps/focused-page.css',
  styles: `
    .finder {
      display: flex;
      flex-wrap: wrap;
      align-items: end;
      gap: 12px;
    }
    .finder mb-field {
      flex: 1 1 260px;
    }
    mb-notice {
      display: block;
      margin-top: 12px;
    }
    .who {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    .who img {
      border-radius: 50%;
      flex: none;
    }
    .who h2 {
      margin: 0;
      font-size: 1.15rem;
      overflow-wrap: anywhere;
    }
    .who p {
      margin: 2px 0 0;
      overflow-wrap: anywhere;
    }
    /* The page's one job, kept in reach while the wall scrolls. */
    .download-bar {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 12px;
      margin: 0 -16px 12px;
      padding: 10px 16px;
      background: var(--bg);
      border-bottom: 1px solid var(--border);
    }
    .candidates {
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 4px;
    }
    .candidates button {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px;
      border: 0;
      border-radius: 8px;
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .candidates button:hover,
    .candidates button:focus-visible {
      background: var(--border);
    }
    .candidates img {
      border-radius: 50%;
      flex: none;
    }
    .candidates span {
      display: grid;
      overflow-wrap: anywhere;
    }
  `,
})
export class MediaDownloadWorkbench implements OnInit {
  /** Where "Invite your friends" goes: the tool's own Invite tab when signed in. */
  readonly inviteLink = input('/invites');

  private sources = inject(AccountSources);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  protected text = signal('');
  protected finding = signal(false);
  protected notFound = signal(false);
  /** Several accounts matched: the picker is open. */
  protected candidates = signal<Account[]>([]);
  protected source = signal<AccountSource | null>(null);
  protected statuses = signal<Status[]>([]);
  protected loading = signal(false);
  protected loadingMore = signal(false);
  protected exhausted = signal(false);
  protected error = signal<string | null>(null);
  protected downloading = signal(false);

  protected items = computed<ProfileMediaItem[]>(() => buildMediaItems(this.statuses()));
  protected nextStep = computed<NextStepCard | null>(() => {
    const account = this.source()?.account;
    return account
      ? {
          link: `/accounts/@${qualified(account)}`,
          title: `Read @${account.username} in Mawkingbird`,
          body: 'Their posts, replies and boosts, with this media wall one tab away.',
        }
      : null;
  });

  /** Pages for the download dialog, from wherever the wall reads. */
  protected loadPage: MediaPageLoader = (cursor, includeBoosts) =>
    this.source()!.page({
      // Mastodon's media filter skips boosts, so with boosts the dialog filters itself.
      onlyMedia: !includeBoosts,
      excludeReblogs: !includeBoosts,
      limit: PAGE,
      maxId: cursor ? pagingId(cursor) : undefined,
    });

  protected closeDownload = () => this.downloading.set(false);
  protected closePicker = () => this.candidates.set([]);

  ngOnInit(): void {
    const acct = this.route.snapshot.queryParamMap.get('acct');
    if (acct) {
      this.text.set(acct);
      void this.find();
    }
  }

  async find(event?: Event): Promise<void> {
    event?.preventDefault();
    const input = parseAccountInput(this.text());
    if (!input || this.finding()) return;
    this.finding.set(true);
    this.notFound.set(false);
    try {
      const found = await this.sources.find(input);
      if (found.length === 1) await this.choose(found[0]);
      else if (found.length) this.candidates.set(found);
      else this.notFound.set(true);
    } finally {
      this.finding.set(false);
    }
  }

  async choose(account: Account): Promise<void> {
    this.candidates.set([]);
    this.loading.set(true);
    this.error.set(null);
    this.statuses.set([]);
    this.source.set(null);
    const source = await this.sources.open(account);
    this.source.set(source);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { acct: qualified(source.account) },
      replaceUrl: true,
    });
    await this.load();
  }

  async more(): Promise<void> {
    if (this.loadingMore() || this.exhausted()) return;
    this.loadingMore.set(true);
    await this.load(this.statuses().at(-1));
    this.loadingMore.set(false);
  }

  /** Open a picture's post on its own server, in a new tab. */
  protected openPost(item: ProfileMediaItem): void {
    const url = item.status.url ?? item.url;
    window.open(url, '_blank', 'noopener');
  }

  private async load(after?: Status): Promise<void> {
    const source = this.source();
    if (!source) return;
    try {
      const batch = await firstValueFrom(
        source.page({
          onlyMedia: true,
          excludeReblogs: true,
          limit: PAGE,
          maxId: after ? pagingId(after) : undefined,
        }),
      );
      if (this.source() !== source) return;
      this.statuses.update((list) => [...list, ...batch]);
      this.exhausted.set(batch.length < PAGE);
    } catch {
      if (this.source() !== source) return;
      this.exhausted.set(true);
      this.error.set(`${source.server} didn't share this account's posts. Try again later.`);
    } finally {
      this.loading.set(false);
    }
  }
}
