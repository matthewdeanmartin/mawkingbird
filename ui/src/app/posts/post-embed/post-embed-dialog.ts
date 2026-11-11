import { Component, computed, inject, input, output, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbControl, MbField } from '../../design-system/field/field';
import { Status } from '../../platform/api/models';
import { buildPostEmbedHtml } from './post-embed';

// i18n postEmbed.title: Embed post
// i18n postEmbed.intro: Paste this HTML into a blog or web page. It works without scripts and links back to the original post.
// i18n postEmbed.code: HTML code
// i18n postEmbed.preview: Preview
// i18n postEmbed.previewTitle: Preview of the embedded post
// i18n postEmbed.copy: Copy HTML
// i18n postEmbed.copied: HTML copied
// i18n postEmbed.copyFailed: Could not copy. Select the code and copy it yourself.
// i18n postEmbed.mediaNote: Media stays on the author's server. If it is deleted there, it disappears from your page too.
// i18n postEmbed.close: Close

/** Minimal reading styles for the preview frame only; the copied HTML has none. */
const PREVIEW_STYLE = `<style>
body{font:15px/1.45 system-ui,sans-serif;margin:8px;color:#111;background:#fff}
blockquote{margin:0;padding:12px 16px;border-left:4px solid #8c8dff;background:#f6f6fb}
blockquote blockquote{margin:8px 0}
img,video{max-width:100%;height:auto}
figure{margin:8px 0}
footer{margin-top:8px;font-size:13px;color:#555}
</style>`;

@Component({
  selector: 'app-post-embed-dialog',
  imports: [MbDialog, MbField, MbControl, MbButton, TranslocoPipe],
  templateUrl: './post-embed-dialog.html',
  styleUrl: './post-embed-dialog.css',
})
export class PostEmbedDialog {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly transloco = inject(TranslocoService);

  readonly status = input.required<Status>();
  readonly closed = output<void>();

  protected readonly html = computed(() =>
    buildPostEmbedHtml(this.status(), this.transloco.getActiveLang() || undefined),
  );
  /**
   * The frame is sandboxed with no permissions (no scripts, no same-origin),
   * and the HTML is our own allow-listed output, so trusting it here is safe.
   */
  protected readonly previewDoc = computed(() =>
    this.sanitizer.bypassSecurityTrustHtml(
      `<!doctype html><meta charset="utf-8">${PREVIEW_STYLE}${this.html()}`,
    ),
  );
  protected readonly hasMedia = computed(() => this.status().media_attachments.length > 0);
  protected readonly copyState = signal<'idle' | 'copied' | 'failed'>('idle');

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.html());
      this.copyState.set('copied');
    } catch {
      this.copyState.set('failed');
    }
  }

  protected selectAll(event: Event): void {
    (event.target as HTMLTextAreaElement).select();
  }
}
