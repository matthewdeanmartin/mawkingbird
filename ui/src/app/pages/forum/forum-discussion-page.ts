import { Component, computed, DestroyRef, effect, inject, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { map } from 'rxjs';
import { MbButton } from '../../design-system/button/button';
import { MbDisclosure } from '../../design-system/disclosure/disclosure';
import { MbNotice } from '../../design-system/notice/notice';
import { threadOrder } from '../../forum/discussion';
import { ForumScan } from '../../forum/forum-scan';
import { ForumView } from '../../forum/forum-view';
import { ThreadPreload } from '../read/thread-preload';
import { Thread } from '../thread/thread';
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
  imports: [RouterLink, TranslocoPipe, MbButton, MbDisclosure, MbNotice, ForumMembers, Thread],
  template: `
    <nav class="back">
      <a mbButton variant="link" routerLink="/forum" [queryParams]="scan.listParams">{{
        'forum.discussion.back' | transloco
      }}</a>
    </nav>
    @if (discussion()?.partial) {
      <mb-notice>{{ 'forum.discussion.partial' | transloco }}</mb-notice>
    }
    @if (rails.rightHidden()) {
      <mb-disclosure [label]="'forum.people' | transloco">
        <app-forum-members />
      </mb-disclosure>
    }
    <app-thread />
  `,
  styles: `
    :host {
      display: block;
    }
    /* In line with the post cards' 16px inset. */
    .back,
    mb-notice,
    mb-disclosure {
      display: block;
      margin-inline: 16px;
    }
    .back {
      padding: 0.75rem 0 0.25rem;
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
