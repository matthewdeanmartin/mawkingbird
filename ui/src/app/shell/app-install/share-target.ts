import {
  afterNextRender,
  Component,
  ElementRef,
  inject,
  Injector,
  OnInit,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbDialog } from '../../design-system/dialog/dialog';
import { Compose } from '../../publishing/compose/compose';
import { Drafts } from '../../publishing/drafts';

// i18n shareTarget.title: Share
// i18n shareTarget.close: Close

/** The composer's autosave slot for a shared page, separate from Home's. */
export const SHARE_TARGET_DRAFT_CONTEXT = 'share-target';

/**
 * One post's text from what another app shared. Android often repeats the
 * link inside `text`, and the title inside `text` too; each piece appears once.
 */
export function sharedText(params: {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}): string {
  const title = params.title?.trim() ?? '';
  const text = params.text?.trim() ?? '';
  const url = params.url?.trim() ?? '';
  const parts: string[] = [];
  if (title && !text.includes(title) && title !== url) parts.push(title);
  if (text) parts.push(text);
  if (url && !text.includes(url)) parts.push(url);
  return parts.join('\n\n');
}

/**
 * `/share` with something to post: the manifest's `share_target`, Unbird's
 * "post this" and the Firefox extension's Share and Quote.
 *
 * Opens the composer in a dialog, filled in and focused at the top so a comment
 * goes above the link. It used to park the text and send the reader to Home,
 * where the small composer sat wherever Home was last scrolled, off screen.
 * Posted: Home. Closed: discarded, and Home's composer is left as it was
 * (owner, 2026-11-27: cancel means cancel). Nothing is ever posted without the reader pressing Post.
 */
@Component({
  selector: 'app-share-target',
  imports: [Compose, MbDialog, TranslocoPipe],
  template: `
    @if (text()) {
      <mb-dialog
        size="wide"
        [title]="'shareTarget.title' | transloco"
        [closeLabel]="'shareTarget.close' | transloco"
        (dismissed)="close()"
      >
        <app-compose draftContext="share-target" [initialText]="text()" (posted)="posted()" />
      </mb-dialog>
    }
  `,
})
export class ShareTarget implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly drafts = inject(Drafts);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  protected readonly text = signal('');

  ngOnInit(): void {
    const query = this.route.snapshot.queryParamMap;
    const text = sharedText({
      title: query.get('title'),
      text: query.get('text'),
      url: query.get('url'),
    });
    if (!text) {
      this.home();
      return;
    }
    // A fresh share always wins over a leftover from an earlier one.
    this.drafts.clearAutosave(SHARE_TARGET_DRAFT_CONTEXT);
    this.text.set(text);
    afterNextRender(() => this.focusText(), { injector: this.injector });
  }

  protected posted(): void {
    this.drafts.clearAutosave(SHARE_TARGET_DRAFT_CONTEXT);
    this.text.set('');
    this.home();
  }

  /**
   * Cancel means cancel: nothing carries over to Home. The autosave slot exists
   * for a closed browser or a crash mid-share, not for a deliberate Close.
   */
  protected close(): void {
    // Removing the composer flushes its autosave; clear it once that has run.
    this.text.set('');
    afterNextRender(
      () => {
        this.drafts.clearAutosave(SHARE_TARGET_DRAFT_CONTEXT);
        this.home();
      },
      { injector: this.injector },
    );
  }

  /** Caret at the start, so the reader's own words go above the shared link. */
  private focusText(): void {
    const box = (this.host.nativeElement as HTMLElement).querySelector('textarea');
    if (!box) return;
    box.focus();
    box.setSelectionRange(0, 0);
    box.scrollTop = 0;
  }

  private home(): void {
    // Replace /share in history so Back does not re-run the share.
    void this.router.navigate(['/home'], { replaceUrl: true });
  }
}
