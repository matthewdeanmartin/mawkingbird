import { ReadingBack } from '../shell/reading-back';
import { Component, computed, DestroyRef, effect, inject, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { MbDisclosure } from '../design-system/disclosure/disclosure';
import { MbNotice } from '../design-system/notice/notice';
import { threadOrder } from './discussion';
import { ForumScan } from './forum-scan';
import { ForumView } from './forum-view';
import { ThreadPreload } from '../reading/read/thread-preload';
import { Thread } from '../reading/thread/thread';
import { ForumMembers } from './forum-members';
import { useForumRails } from './forum-rails';

// i18n forum.discussion.back: ← Back to discussions
// i18n forum.discussion.partial: The start of this conversation could not be reached. This is as far back as it goes.

/**
 * One discussion, at `/forum/d/:id`: today's thread page, in Forum mode.
 *
 * When the scan already holds the whole tree, it is handed to the thread page
 * ({@link ThreadPreload}) in reading order, so opening it costs nothing and
 * shows the replies read from other servers too. Otherwise the thread page
 * loads it as it would any post. The rendering is the thread page's own; this
 * adds only the way back to the list.
 */
@Component({
  selector: 'app-forum-discussion-page',
  imports: [ReadingBack, TranslocoPipe, MbDisclosure, MbNotice, ForumMembers, Thread],
  template: `
    <app-reading-back />
    @if (discussion()?.partial) {
      <mb-notice>{{ 'forum.discussion.partial' | transloco }}</mb-notice>
    }
    @if (rails.rightHidden()) {
      <mb-disclosure [label]="'forum.people' | transloco">
        <app-forum-members />
      </mb-disclosure>
    }
    <app-thread [showBack]="false" />
  `,
  styles: `
    :host {
      display: block;
    }
    /* In line with the post cards' 16px inset. */
    mb-notice,
    mb-disclosure {
      display: block;
      margin-inline: 16px;
    }
  `,
})
export class ForumDiscussionPage {
  protected scan = inject(ForumScan);
  private preload = inject(ThreadPreload);
  private route = inject(ActivatedRoute);
  private view = inject(ForumView);
  protected rails = useForumRails();

  private id = toSignal(this.route.paramMap.pipe(map((params) => params.get('id'))), {
    initialValue: this.route.snapshot.paramMap.get('id'),
  });
  protected discussion = computed(() => {
    const id = this.id();
    return id ? this.scan.containing(id) : null;
  });

  private restoreScan?: () => void;

  suspendReading(): void {
    this.restoreScan = this.scan.checkpoint();
    this.rails.suspend();
  }

  resumeReading(): void {
    this.restoreScan?.();
    this.restoreScan = undefined;
    this.rails.resume();
    this.view.focus.set(this.id());
  }

  constructor() {
    // The Members rail lists this discussion's people while it is open.
    effect(() => {
      const id = this.id();
      untracked(() => this.view.focus.set(id));
    });
    inject(DestroyRef).onDestroy(() => {
      if (this.view.focus() === this.id()) this.view.focus.set(null);
    });
    // Subscribed before the thread page's own paramMap subscription, so each
    // offer is in place before it loads.
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('id');
      const discussion = id ? this.scan.discussion(id) : null;
      if (!id || !discussion?.treeLoaded) return;
      const [status, ...descendants] = threadOrder(discussion);
      this.preload.offer(id, { status, ancestors: [], descendants });
    });
  }
}
