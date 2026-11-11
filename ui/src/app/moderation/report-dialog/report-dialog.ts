import { accountProfilePath } from '../../accounts/account-route';
import { Account } from '../../platform/api/models';
import { SubmittedReports } from '../report-history/report-history';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { Api } from '../../platform/api/api';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbField, MbControl } from '../../design-system/field/field';
import { MbButton } from '../../design-system/button/button';
import { MbNotice } from '../../design-system/notice/notice';
import { ProviderId } from '../../platform/api/models';
import { BlueskyApi, BskyReportReason } from '../../connections/bluesky/bluesky-api';
import { BskyRef } from '../../connections/bluesky/bluesky-types';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { ServerAbout } from '../../discovery/server-about';

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
// i18n report.rules: Which server rules were broken?
// i18n report.specificCollection: Reporting a specific collection.
// i18n report.rulesLoading: Loading this server's rules…
// i18n report.rulesNone: This server has not published any rules. Describe the problem in the comment.
// i18n report.rulesRequired: Choose at least one rule this account broke.
// i18n report.forward: Also send an anonymous copy to {{host}}
// i18n report.forwardHint: Their moderators can act on the account at its home server. Your server's moderators get the report either way.

const CATEGORIES = ['spam', 'violation', 'other'] as const;

@Component({
  selector: 'app-report-dialog',
  imports: [
    MbDialog,
    MbField,
    MbControl,
    MbButton,
    MbNotice,
    MbCheckbox,
    FormsModule,
    TranslocoPipe,
  ],
  templateUrl: './report-dialog.html',
  styleUrl: './report-dialog.css',
})
export class ReportDialog {
  private history = inject(SubmittedReports);
  private api = inject(Api);
  private blueskyApi = inject(BlueskyApi);
  private transloco = inject(TranslocoService);
  protected serverAbout = inject(ServerAbout);

  /** Username shown in the heading. */
  readonly username = input.required<string>();
  readonly account = input<Account | undefined>(undefined);
  readonly accountId = input.required<string>();
  /** Optional status being reported (a "report this post" flow). */
  readonly statusId = input<string | undefined>(undefined);
  readonly provider = input<ProviderId | undefined>(undefined);
  readonly statusRef = input<BskyRef | null>(null);
  /** Optional Mastodon collection being reported (4.6+), owned by `accountId`. */
  readonly collectionId = input<string | undefined>(undefined);

  readonly closed = output<void>();
  readonly submitted = output<void>();

  protected readonly categories = CATEGORIES;
  protected category = signal<string>('spam');
  protected comment = signal('');
  protected submitting = signal(false);
  protected error = signal('');
  /** Rule ids chosen for a rule-violation report. */
  protected ruleIds = signal<ReadonlySet<string>>(new Set());
  /** Forward the report to the remote account's server. Opt-in, never default. */
  protected forward = signal(false);

  /**
   * The reported account's home server, when it is not this server. Mastodon
   * only forwards reports about remote accounts, so local reports get no choice.
   */
  protected readonly remoteHost = computed(() => {
    if (this.provider() === 'bluesky') return null;
    const acct = this.account()?.acct ?? this.username();
    const at = acct.indexOf('@', 1);
    return at > 0 ? acct.slice(at + 1) : null;
  });

  protected setCategory(category: string): void {
    this.category.set(category);
    if (category === 'violation' && this.provider() !== 'bluesky') {
      // Rules are fetched once per server and cached; see ServerAbout.
      this.serverAbout.load();
    }
  }

  protected toggleRule(id: string, checked: boolean): void {
    const next = new Set(this.ruleIds());
    if (checked) next.add(id);
    else next.delete(id);
    this.ruleIds.set(next);
  }

  submit(): void {
    if (this.submitting()) {
      return;
    }
    this.submitting.set(true);
    this.error.set('');
    const scope = this.history.scope();
    const receipt = {
      accountId: this.accountId(),
      profilePath: this.account() ? accountProfilePath(this.account()!) : undefined,
      username: this.username(),
      statusId: this.statusId(),
      category: this.category(),
    };
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
          this.history.record(receipt, scope);
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
    const ruleIds =
      this.category() === 'violation'
        ? (this.serverAbout.rules() ?? []).map((r) => r.id).filter((id) => this.ruleIds().has(id))
        : [];
    if (this.category() === 'violation' && this.serverAbout.hasRules() && !ruleIds.length) {
      this.submitting.set(false);
      this.error.set(this.transloco.translate('report.rulesRequired'));
      return;
    }
    const forward = !!this.remoteHost() && this.forward();
    this.api
      .report(this.accountId(), this.category(), this.comment(), statusIds, {
        ruleIds,
        forward,
        collectionIds: this.collectionId() ? [this.collectionId()!] : undefined,
      })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.history.record(receipt, scope);
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
