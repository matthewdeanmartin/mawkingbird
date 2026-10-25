import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map, Subscription, timeout } from 'rxjs';
import { Api } from '../../api';
import { Auth } from '../../auth';
import { MbButton } from '../../design-system/button/button';
import { MbContentState } from '../../design-system/content-state/content-state';
import { MbControl, MbField } from '../../design-system/field/field';
import { RadioPlayer } from './radio-player';
import { RadioControls } from './radio-controls';
import { RadioDock } from './radio-dock';
import { RadioStudio } from './radio-studio';
import { Status, UserList } from '../../models';
import { StatusCard } from '../../status-card/status-card';

// i18n radio.title: Radio
// i18n radio.source: Audio source
// i18n radio.account: Account
// i18n radio.home: Home feed
// i18n radio.list: List
// i18n radio.handle: Account handle
// i18n radio.handleHint: Enter a local username or username@server.
// i18n radio.chooseList: Choose a list
// i18n radio.discover: Find audio
// i18n radio.more: Continue scanning
// i18n radio.cancel: Cancel scan
// i18n radio.progress: Scanned {{scanned}} posts · found {{matches}} audio posts
// i18n radio.loading: Looking for audio…
// i18n radio.failed: Could not load this source. Your results are retained. Try again later.
// i18n radio.rateLimited: The server asked us to wait until {{time}} before trying again.
// i18n radio.exhausted: Reached the end of the available feed.
// i18n radio.paused: Scan paused. Continue to look for older audio posts.
// i18n radio.empty: Choose a feed to find audio posts.
// i18n radio.signIn: Sign in with a Mastodon account to use Radio.
// i18n radio.studioTitle: Radio Studio
// i18n radio.studioHint: Your audio catalogue and publication workspace will appear here.
// i18n radio.playerHint: Choose audio from an account, your home feed or a list. Radio keeps playing as you explore the app.

@Component({
  selector: 'app-radio-page',
  imports: [
    FormsModule,
    TranslocoPipe,
    MbButton,
    MbContentState,
    MbField,
    MbControl,
    StatusCard,
    RadioControls,
    RadioStudio,
  ],
  templateUrl: './radio-page.html',
  styleUrl: './radio-page.css',
})
export class RadioPage {
  private readonly api = inject(Api);
  private readonly destroy = inject(DestroyRef);
  readonly auth = inject(Auth);
  readonly studio = inject(ActivatedRoute).snapshot.routeConfig?.path === 'radio/studio';
  readonly player = inject(RadioPlayer);
  readonly scan = this.player.scan;
  readonly source = this.player.source;
  readonly handle = this.player.handle;
  readonly listId = this.player.listId;
  readonly lists = signal<UserList[]>([]);
  readonly resolving = signal(false);
  readonly failed = signal(false);
  readonly started = this.player.started;
  readonly scanReady = this.player.scanReady;
  private lookup?: Subscription;
  private listRequest?: Subscription;

  constructor() {
    this.player.installDock(RadioDock);
    if (this.source() === 'list') this.chooseSource('list');
    this.destroy.onDestroy(() => {
      this.lookup?.unsubscribe();
      if (!this.player.active()) this.scan.cancel();
    });
  }

  get signedIn(): boolean {
    return !this.auth.isAnonymous && !this.auth.isBlueskyPrimary;
  }

  chooseSource(source: 'account' | 'home' | 'list'): void {
    this.source.set(source);
    if (source === 'list' && !this.lists().length && this.signedIn) {
      this.listRequest?.unsubscribe();
      this.failed.set(false);
      this.listRequest = this.api
        .lists()
        .pipe(timeout(30_000), takeUntilDestroyed(this.destroy))
        .subscribe({
          next: (lists) => this.lists.set(lists),
          error: () => this.failed.set(true),
        });
    }
  }

  cancel(): void {
    this.lookup?.unsubscribe();
    this.resolving.set(false);
    this.scan.cancel();
  }

  discover(): void {
    if (!this.signedIn || Date.now() < this.scan.retryAt()) return;
    this.cancel();
    this.player.stop();
    this.failed.set(false);
    this.started.set(true);
    this.scanReady.set(false);
    const source = this.source();
    if (source === 'home') {
      this.scanReady.set(true);
      void this.scan.start((cursor) =>
        this.api
          .homeTimelinePage(cursor)
          .pipe(map((page) => ({ statuses: page.statuses, next: page.nextMaxId }))),
      );
    } else if (source === 'list') {
      const id = this.listId();
      if (!id) return;
      this.scanReady.set(true);
      void this.scan.start((cursor) => this.api.listTimeline(id, cursor, 40).pipe(map(feedPage)));
    } else {
      const handle = this.handle().trim().replace(/^@/, '');
      if (!handle) return;
      this.resolving.set(true);
      this.lookup = this.api
        .lookupAccount(handle)
        .pipe(timeout(30_000), takeUntilDestroyed(this.destroy))
        .subscribe({
          next: (account) => {
            this.resolving.set(false);
            this.scanReady.set(true);
            void this.scan.start((cursor) =>
              this.api
                .getAccountStatuses(account.id, {
                  maxId: cursor,
                  limit: 40,
                  onlyMedia: true,
                  excludeReblogs: true,
                })
                .pipe(map(feedPage)),
            );
          },
          error: () => {
            this.resolving.set(false);
            this.failed.set(true);
          },
        });
    }
  }

  retryTime(): string {
    return new Date(this.scan.retryAt()).toLocaleTimeString();
  }

  playPost(post: Status): void {
    this.player.select(this.player.queue().findIndex((track) => track.post.id === post.id));
  }
}

function feedPage(statuses: Status[]): { statuses: Status[]; next: string | null } {
  // Short pages do not prove exhaustion; try the cursor until the server returns no posts.
  return { statuses, next: statuses.at(-1)?.id ?? null };
}
