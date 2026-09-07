import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, Injector, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { HugoSettings } from '../../providers/hugo/hugo-settings';
import { PossePublish } from '../../providers/hugo/posse-publish';
import { PosseEntry, PosseQueue } from '../../providers/hugo/posse-queue';
import { DeliveryState, WebmentionSend } from '../../providers/hugo/webmention-send';
import { DeployState, isTerminal } from '../../providers/hugo/hugo-deploy';
import { HugoDeployWatch } from '../../providers/hugo/hugo-deploy-watch';
import { PageDiagnostics } from '../../page-diagnostics';

/** One target's outcome, for the results list under the queue. */
interface DeliveryReport {
  targetUrl: string;
  targetAuthor: string;
  state: DeliveryState;
  endpoint: string | null;
  message: string;
}

/**
 * The POSSE queue — interactions waiting to be recorded on your own site.
 *
 * A page you *act on* rather than one you configure, which is why it lives at
 * `/posse` in the main routes rather than under settings. The badge in the
 * shell is what makes sure nothing sits here forgotten.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n posse.head: Waiting to publish
// i18n posse.note: Likes, boosts and replies recorded for your own site. They stay here until you publish them, so a session of reading is one commit rather than twenty.
// i18n posse.notConnected: No Hugo blog is connected.
// i18n posse.connectOne: Connect one
// i18n posse.toPublishThese: to publish these.
// i18n posse.empty: Nothing is waiting.
// i18n posse.emptyHint.a: With
// i18n posse.emptyHint.recordToggle: Record interactions on my blog
// i18n posse.emptyHint.b: switched on, the posts you like and boost are collected here — then published to your own site in one go.
// i18n posse.waiting: {{count}} waiting
// i18n posse.publishing: Publishing…
// i18n posse.publishAll: Publish all
// i18n posse.kind.like: Liked
// i18n posse.kind.repost: Boosted
// i18n posse.kind.reply: Replied to
// i18n posse.removeThisLike: Remove this like
// i18n posse.removeThisRepost: Remove this repost
// i18n posse.removeThisReply: Remove this reply
// i18n posse.original: Original ↗
// i18n posse.remove: Remove
// i18n posse.building: Recorded. Waiting for your site to rebuild before letting anyone know — a webmention points at a page that has to exist first.
// i18n posse.notifyHeading: Letting the other sites know
// i18n posse.checking: checking…
// i18n posse.notifyNote: Most sites cannot be notified — Mastodon and Bluesky use their own systems and have no webmention endpoint. That is expected, and your records are published either way.
// i18n posse.notified: Notified
// i18n posse.noEndpoint: No endpoint
// i18n posse.cantSend: Can't send
// i18n posse.refused: Refused
// i18n posse.via: via
// i18n posse.recorded.one: Recorded {{count}} interaction to {{path}}.
// i18n posse.recorded.other: Recorded {{count}} interactions to {{path}}.
// i18n posse.alreadyRecorded.one: That {{count}} interaction was already recorded.
// i18n posse.alreadyRecorded.other: Those {{count}} interactions were already recorded.
// i18n posse.publishError: Couldn't record these to your blog.
// i18n posse.buildFailed: Your site build failed, so the pages these link to do not exist yet. Nothing was sent — fix the build and publish again.
@Component({
  selector: 'app-posse-page',
  imports: [DatePipe, RouterLink, TranslocoPipe],
  templateUrl: './posse-page.html',
  styleUrl: './posse-page.css',
})
export class PossePage {
  protected readonly queue = inject(PosseQueue);
  protected readonly settings = inject(HugoSettings);
  private readonly publisher = inject(PossePublish);
  private readonly sender = inject(WebmentionSend);
  private readonly deployWatch = inject(HugoDeployWatch);
  private readonly injector = inject(Injector);
  private readonly diagnostics = inject(PageDiagnostics);
  private readonly transloco = inject(TranslocoService);

  protected readonly publishing = signal(false);
  /** Waiting for the site to rebuild, so the source pages exist. */
  protected readonly building = signal(false);
  protected readonly notifying = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly error = signal<string | null>(null);

  /** What happened when each target's site was notified, after a publish. */
  protected readonly deliveries = signal<DeliveryReport[]>([]);

  /**
   * Whether any delivery actually reached anyone.
   *
   * Used only to decide whether the results are worth a heading. Most batches
   * will be entirely `no-endpoint` — that is the expected shape, not a problem.
   */
  protected readonly anyDelivered = computed(() =>
    this.deliveries().some((report) => report.state === 'delivered'),
  );

  /** Newest first — the most recent thing you did is the most recognisable. */
  protected readonly entries = computed(() =>
    [...this.queue.entries()].sort((a, b) => b.queuedAt.localeCompare(a.queuedAt)),
  );

  protected readonly canPublish = computed(
    () => !this.queue.isEmpty() && this.settings.connected() && !this.publishing(),
  );

  protected label(entry: PosseEntry): string {
    switch (entry.kind) {
      case 'like':
        return this.transloco.translate<string>('posse.kind.like');
      case 'repost':
        return this.transloco.translate<string>('posse.kind.repost');
      case 'reply':
        return this.transloco.translate<string>('posse.kind.reply');
    }
  }

  protected removeLabel(entry: PosseEntry): string {
    switch (entry.kind) {
      case 'like':
        return this.transloco.translate<string>('posse.removeThisLike');
      case 'repost':
        return this.transloco.translate<string>('posse.removeThisRepost');
      case 'reply':
        return this.transloco.translate<string>('posse.removeThisReply');
    }
  }

  protected icon(entry: PosseEntry): string {
    switch (entry.kind) {
      case 'like':
        return '★';
      case 'repost':
        return '🔁';
      case 'reply':
        return '💬';
    }
  }

  async publishAll(): Promise<void> {
    if (!this.canPublish()) {
      return;
    }
    this.publishing.set(true);
    this.notice.set(null);
    this.error.set(null);
    this.deliveries.set([]);
    // Snapshot before publishing: a successful publish clears the queue, and
    // these are what the delivery pass needs to iterate.
    const published = [...this.queue.entries()];
    try {
      const result = await this.publisher.publishAll();
      const count = result.publishedIds.length;
      this.notice.set(
        result.commitSha
          ? this.transloco.translate<string>(
              count === 1 ? 'posse.recorded.one' : 'posse.recorded.other',
              { count, path: result.path },
            )
          : this.transloco.translate<string>(
              count === 1 ? 'posse.alreadyRecorded.one' : 'posse.alreadyRecorded.other',
              { count },
            ),
      );
      // Published is the durable part and it is now done. Notifying the other
      // sites is a courtesy on top, and its failure never retracts any of that.
      if (await this.sourcePagesLive(result.commitSha)) {
        await this.notifyTargets(published, result.sourceUrls);
      }
    } catch (error: unknown) {
      this.diagnostics.error('POSSE', 'publish:error', error, { queued: published.length });
      this.error.set(
        error instanceof Error
          ? error.message
          : this.transloco.translate<string>('posse.publishError'),
      );
    } finally {
      this.publishing.set(false);
    }
  }

  /**
   * Wait for the commit to become a built site before notifying anyone.
   *
   * A webmention's `source` is fetched by any receiver that verifies, and it
   * does not exist until Actions has rebuilt the site — sending immediately
   * after the commit means sending a URL that 404s, and a conscientious
   * receiver rejects it. So delivery waits.
   *
   * Three endings, and the middle one is the reason this is not just
   * `await live`:
   *  - `live` — deliver.
   *  - `no-build` / `unknown` — deliver anyway. The site deploys some other way,
   *    or we lack `Actions: read`; we cannot tell when it is ready and refusing
   *    forever would be worse than one send that might be early.
   *  - `failed` — do not deliver. The source page will not exist at all.
   */
  private async sourcePagesLive(commitSha: string): Promise<boolean> {
    if (!commitSha) {
      // Nothing was committed (everything was already recorded), so the source
      // pages are from an earlier publish and are already built.
      return true;
    }
    this.building.set(true);
    try {
      this.deployWatch.watch(commitSha);
      const state = await this.settledDeployState();
      if (state === 'failed') {
        this.error.set(this.transloco.translate<string>('posse.buildFailed'));
        return false;
      }
      return true;
    } finally {
      this.building.set(false);
      this.deployWatch.stop();
    }
  }

  /** Resolve once the build watcher reaches a terminal verdict. */
  private settledDeployState(): Promise<DeployState['kind']> {
    return new Promise((resolve) => {
      const done = effect(
        () => {
          const state = this.deployWatch.current();
          if (state && isTerminal(state)) {
            resolve(state.kind);
            // Defer so the effect is not destroyed while it is running.
            queueMicrotask(() => done.destroy());
          }
        },
        { injector: this.injector },
      );
    });
  }

  /**
   * Tell each target's site, where there is a site that can be told.
   *
   * Deliberately sequential and one attempt each: a webmention is a courtesy
   * notification, and a client that fires them in parallel with retries is a
   * client that hammers strangers' endpoints.
   *
   * Most results will be `no-endpoint`, which is correct rather than a failure
   * — see `WebmentionSend`. The UI styles it neutrally for exactly that reason.
   */
  private async notifyTargets(
    entries: readonly PosseEntry[],
    sourceUrls: Record<string, string>,
  ): Promise<void> {
    if (!entries.length) {
      return;
    }
    this.sender.resetCache();
    this.notifying.set(true);
    try {
      for (const entry of entries) {
        const source = sourceUrls[entry.id];
        if (!source) {
          // No site URL configured, so there is no page to point a receiver at.
          continue;
        }
        const result = await this.sender.send(entry.targetUrl, source);
        this.deliveries.update((list) => [
          ...list,
          { targetUrl: entry.targetUrl, targetAuthor: entry.targetAuthor, ...result },
        ]);
      }
    } finally {
      this.notifying.set(false);
    }
  }

  remove(entry: PosseEntry): void {
    this.queue.remove(entry.id);
  }
}
