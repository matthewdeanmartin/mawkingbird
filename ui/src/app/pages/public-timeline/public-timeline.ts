import { Component, effect, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subscription } from 'rxjs';
import { Api } from '../../api';
import { ClientPrefs } from '../../client-prefs';
import { CommandBar } from '../../command-bar/command-bar';
import { Status } from '../../models';
import { StatusCard } from '../../status-card/status-card';
import { Streaming } from '../../streaming';

// i18n publicTimeline.all: All
// i18n publicTimeline.local: Local
// i18n publicTimeline.loading: Loading…
// i18n publicTimeline.empty: No public statuses yet.

@Component({
  selector: 'app-public-timeline',
  imports: [CommandBar, StatusCard, TranslocoPipe],
  templateUrl: './public-timeline.html',
})
export class PublicTimeline implements OnInit, OnDestroy {
  private api = inject(Api);
  private streaming = inject(Streaming);
  private prefs = inject(ClientPrefs);

  protected statuses = signal<Status[]>([]);
  protected loading = signal(true);
  protected local = signal(false);
  protected live = signal(false);

  private liveSub: Subscription | null = null;
  private loadSub: Subscription | null = null;

  /** Follow Blue → "Auto-refresh timeline" for as long as this page is open. */
  private readonly liveEffect = effect(() => this.syncLive());

  ngOnInit(): void {
    this.load();
  }

  ngOnDestroy(): void {
    this.liveSub?.unsubscribe();
    this.loadSub?.unsubscribe();
  }

  setLocal(local: boolean): void {
    if (this.local() === local) {
      return;
    }
    this.local.set(local);
    this.load();
    if (this.live()) {
      this.restartLive();
    }
  }

  /**
   * Open or close the stream to match Blue → "Auto-refresh timeline", the same
   * preference Home follows now that the toolbar button is gone.
   */
  private syncLive(): void {
    const wanted = this.prefs.autoRefreshTimeline();
    if (wanted === this.live()) {
      return;
    }
    if (!wanted) {
      this.liveSub?.unsubscribe();
      this.liveSub = null;
      this.live.set(false);
      return;
    }
    this.live.set(true);
    // Going live starts from a fresh snapshot: refetch, then stream deltas on top.
    this.load();
    this.restartLive();
  }

  private restartLive(): void {
    this.liveSub?.unsubscribe();
    this.liveSub = this.streaming
      .open({ stream: 'public', local: this.local() })
      .subscribe(({ event, payload }) => {
        if (event === 'update') {
          this.statuses.update((list) => [payload as Status, ...list]);
        } else if (event === 'delete') {
          const id = payload as string;
          this.statuses.update((list) => list.filter((s) => s.id !== id));
        }
      });
  }

  load(): void {
    this.loadSub?.unsubscribe();
    this.loading.set(true);
    this.loadSub = this.api.publicTimeline(this.local()).subscribe({
      next: (s) => {
        this.statuses.set(s);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  onChanged(index: number, updated: Status): void {
    this.statuses.update((list) => list.map((s, i) => (i === index ? updated : s)));
  }

  onDeleted(removed: Status): void {
    this.statuses.update((list) => list.filter((s) => s.id !== removed.id));
  }
}
