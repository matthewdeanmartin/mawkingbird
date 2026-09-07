import { Component, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { Api } from '../api';
import { FocusTrap } from '../a11y/focus-trap';
import { ProviderId } from '../models';
import { BlueskyApi, BskyReportReason } from '../providers/bluesky/bluesky-api';
import { BskyRef } from '../providers/bluesky/bluesky-types';

// i18n report.title: Report @{{username}}
// i18n report.specificPost: Reporting a specific post.
// i18n report.review: Please review this carefully. Reports cannot be undone after they are sent.
// i18n report.blueskyService: This report will be sent to Bluesky's moderation service.
// i18n report.category: Category
// i18n report.comment: Comment (optional)
// i18n report.placeholder: What's wrong?
// i18n report.cancel: Cancel
// i18n report.sending: Sending…
// i18n report.confirm: Confirm report
// i18n report.errorExact: Could not identify the exact Bluesky post to report.
// i18n report.errorAccount: Could not identify the Bluesky account to report.
// i18n report.errorBluesky: Could not send this report to Bluesky. Your authorization may need to be renewed in Settings → Connections.
// i18n report.errorMastodon: Could not send this report to Mastodon. Please try again.

const CATEGORIES = ['spam', 'violation', 'other'] as const;

@Component({
  selector: 'app-report-dialog',
  imports: [FocusTrap, FormsModule, TranslocoPipe],
  templateUrl: './report-dialog.html',
  styleUrl: './report-dialog.css',
})
export class ReportDialog {
  private api = inject(Api);
  private blueskyApi = inject(BlueskyApi);
  private transloco = inject(TranslocoService);

  /** Username shown in the heading. */
  readonly username = input.required<string>();
  readonly accountId = input.required<string>();
  /** Optional status being reported (a "report this post" flow). */
  readonly statusId = input<string | undefined>(undefined);
  readonly provider = input<ProviderId | undefined>(undefined);
  readonly statusRef = input<BskyRef | null>(null);

  readonly closed = output<void>();
  readonly submitted = output<void>();

  protected readonly categories = CATEGORIES;
  protected category = signal<string>('spam');
  protected comment = signal('');
  protected submitting = signal(false);
  protected error = signal('');

  submit(): void {
    if (this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.error.set('');
    if (this.provider() === 'bluesky') {
      const reason = BLUESKY_REASONS[this.category()] ?? BLUESKY_REASONS['other'];
      const ref = this.statusRef();
      if (this.statusId() && !ref) {
        this.submitting.set(false);
        this.error.set(this.transloco.translate('report.errorExact'));
        return;
      }
      const did = this.accountId().replace(/^bsky:/, '');
      if (!ref && !did.startsWith('did:')) {
        this.submitting.set(false);
        this.error.set(this.transloco.translate('report.errorAccount'));
        return;
      }
      const call = ref
        ? this.blueskyApi.reportPost(ref.uri, ref.cid, reason, this.comment())
        : this.blueskyApi.reportAccount(did, reason, this.comment());
      call.subscribe({
        next: () => {
          this.submitting.set(false);
          this.submitted.emit();
        },
        error: () => {
          this.submitting.set(false);
          this.error.set(this.transloco.translate('report.errorBluesky'));
        },
      });
      return;
    }
    const statusIds = this.statusId() ? [this.statusId()!] : undefined;
    this.api.report(this.accountId(), this.category(), this.comment(), statusIds).subscribe({
      next: () => {
        this.submitting.set(false);
        this.submitted.emit();
      },
      error: () => {
        this.submitting.set(false);
        this.error.set(this.transloco.translate('report.errorMastodon'));
      },
    });
  }
}

const BLUESKY_REASONS: Record<string, BskyReportReason> = {
  spam: 'tools.ozone.report.defs#reasonMisleadingSpam',
  violation: 'tools.ozone.report.defs#reasonRuleOther',
  other: 'tools.ozone.report.defs#reasonOther',
};
