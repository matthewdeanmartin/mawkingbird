import { accountProfilePath } from '../../accounts/account-route';
import { Account } from '../../platform/api/models';
import { SubmittedReports } from '../report-history/report-history';
import {
  Component,
  computed,
  inject,
  input,
  OnInit,
  output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { Api } from '../../platform/api/api';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbField, MbControl } from '../../design-system/field/field';
import { MbButton } from '../../design-system/button/button';
import { MbNotice } from '../../design-system/notice/notice';
import { ProviderId } from '../../platform/api/models';
import { BlueskyApi } from '../../connections/bluesky/bluesky-api';
import { BskyRef } from '../../connections/bluesky/bluesky-types';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { ServerAbout } from '../../discovery/server-about';
import { BlueskyModeration, BskyLabelerEntry } from '../../connections/bluesky/bluesky-moderation';
import { AuthorModeration, ModerationTarget } from '../author-moderation';
import { MutedPosts } from '../muted-posts';
import { Auth } from '../../platform/session/auth';
import { ReportGate, ReportGateModel } from '../report-gate/report-gate';
import {
  BLUESKY_REPORT_GROUPS,
  BskyReportReasonId,
  defaultBlueskyReason,
} from './bluesky-report-reasons';

// i18n report.title: Report @{{username}}
// i18n report.specificPost: Reporting a specific post.
// i18n report.review: Please review this carefully. Reports cannot be undone after they are sent.
// i18n report.blueskyService: This report will be sent to Bluesky's moderation service.
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
// i18n report.comment: Comment (optional)
// i18n report.placeholder: What's wrong?
// i18n report.forward: Also send an anonymous copy to {{host}}
// i18n report.forwardHint: Their moderators can act on the account at its home server. Your server's moderators get the report either way.
// i18n report.forwardRules: {{host}}’s own rules
// i18n report.continue: Continue
// i18n report.change: Change
// i18n report.whoReads: Read by the moderators of {{server}}.
// i18n report.triage.title: What’s going on?
// i18n report.triage.dontWant: I just don’t want to see this
// i18n report.triage.dontWantHint: Mute, block or hide it. Nothing is sent to moderators.
// i18n report.triage.spam: It’s spam
// i18n report.triage.spamHint: Ads, scams, repeated unwanted replies or links.
// i18n report.triage.violation: It breaks a rule of {{server}}
// i18n report.triage.violationHint: You will choose which rule.
// i18n report.triage.legal: It’s illegal
// i18n report.triage.legalHint: It breaks the law where {{server}} operates, or where you are.
// i18n report.triage.other: Something else
// i18n report.triage.otherHint: Explain in the comment.
// i18n report.triage.report: Report it to moderators
// i18n report.triage.reportHint: Choose what kind of problem it is next.
// i18n report.legalNote: Moderators of {{server}} judge this under the law of the place they operate from. If someone is in danger, contact local emergency services.
// i18n report.alt.title: Stop seeing this
// i18n report.alt.intro: These take effect at once. Nobody is told, and no moderator has to read anything.
// i18n report.alt.mute: Mute @{{username}}
// i18n report.alt.muteHint: Their posts leave your feeds. They can still see and follow you.
// i18n report.alt.block: Block @{{username}}
// i18n report.alt.blockHint: They can’t see or follow you, and you won’t see them.
// i18n report.alt.hide: Hide this post
// i18n report.alt.hideHint: Only this post, in this browser.
// i18n report.alt.filter: Add a keyword filter
// i18n report.alt.filterHint: Hide every post with a word or phrase.
// i18n report.alt.done: Done. You can undo it from their profile or Settings.
// i18n report.alt.failed: That didn’t work. Please try again.
// i18n report.alt.reportAnyway: It’s worse than that: report it

/** What the reader says is going on (step 2). `dontWant` never reports. */
export type ReportTriage = 'dontWant' | 'spam' | 'violation' | 'legal' | 'other' | 'report';

/** Mastodon report categories, as `POST /api/v1/reports` takes them. */
const MASTODON_TRIAGE: readonly ReportTriage[] = [
  'dontWant',
  'spam',
  'violation',
  'legal',
  'other',
];
const BLUESKY_TRIAGE: readonly ReportTriage[] = ['dontWant', 'report'];

type Step = 'gate' | 'triage' | 'alternatives' | 'details';

/** Literal keys, so the i18n checker can see every one. */
const TRIAGE_KEYS: Record<ReportTriage, { label: string; hint: string }> = {
  dontWant: { label: 'report.triage.dontWant', hint: 'report.triage.dontWantHint' },
  spam: { label: 'report.triage.spam', hint: 'report.triage.spamHint' },
  violation: { label: 'report.triage.violation', hint: 'report.triage.violationHint' },
  legal: { label: 'report.triage.legal', hint: 'report.triage.legalHint' },
  other: { label: 'report.triage.other', hint: 'report.triage.otherHint' },
  report: { label: 'report.triage.report', hint: 'report.triage.reportHint' },
};

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
    RouterLink,
    ReportGate,
  ],
  templateUrl: './report-dialog.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './report-dialog.css',
})
export class ReportDialog implements OnInit {
  private history = inject(SubmittedReports);
  private api = inject(Api);
  private blueskyApi = inject(BlueskyApi);
  private bskyModeration = inject(BlueskyModeration);
  private authorModeration = inject(AuthorModeration);
  private mutedPosts = inject(MutedPosts);
  private auth = inject(Auth);
  protected readonly gate = inject(ReportGateModel);
  protected readonly bskyGroups = BLUESKY_REPORT_GROUPS;
  protected readonly triageKeys = TRIAGE_KEYS;
  /** The exact Bluesky reason; starts from the category's closest one. */
  protected bskyReason = signal<BskyReportReasonId>(defaultBlueskyReason('spam'));
  /** '' sends to Bluesky's own moderation; otherwise a subscribed service's DID. */
  protected bskySendTo = signal('');
  protected bskyServices = signal<BskyLabelerEntry[]>([]);
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

  protected category = signal<string>('spam');
  protected comment = signal('');
  protected submitting = signal(false);
  protected error = signal('');
  /** Rule ids chosen for a rule-violation report. */
  protected ruleIds = signal<ReadonlySet<string>>(new Set());
  /** Forward the report to the remote account's server. Opt-in, never default. */
  protected forward = signal(false);

  protected readonly isBluesky = computed(() => this.provider() === 'bluesky');
  protected readonly triageOptions = computed(() =>
    this.isBluesky() ? BLUESKY_TRIAGE : MASTODON_TRIAGE,
  );
  protected triage = signal<ReportTriage | null>(null);
  /** The gate was passed in this dialog; it never comes back mid-report. */
  private gatePassed = signal(false);
  private phase = signal<Exclude<Step, 'gate'>>('triage');
  protected readonly step = computed<Step>(() =>
    !this.isBluesky() && !this.gatePassed() && this.gate.needed() ? 'gate' : this.phase(),
  );
  /** Result of the last mute/block/hide on the alternatives step. */
  protected altResult = signal<'done' | 'failed' | null>(null);

  /**
   * The reported account's home server, when it is not this server. Mastodon
   * only forwards reports about remote accounts, so local reports get no choice.
   */
  protected readonly remoteHost = computed(() => {
    if (this.isBluesky()) return null;
    const acct = this.account()?.acct ?? this.username();
    const at = acct.indexOf('@', 1);
    return at > 0 ? acct.slice(at + 1) : null;
  });

  private readonly moderationTarget = computed<ModerationTarget | null>(() => {
    const account = this.account();
    return account ? { account, provider: this.provider() } : null;
  });
  protected readonly canModerateAuthor = computed(() => {
    const target = this.moderationTarget();
    return !!target && this.authorModeration.route(target) !== null;
  });
  protected readonly canFilter = computed(() => !this.auth.isAnonymous && !this.isBluesky());

  ngOnInit(): void {
    if (this.isBluesky()) {
      // The subscribed moderation services a report may go to instead.
      void this.bskyModeration
        .labelers()
        .then((services) => this.bskyServices.set(services))
        .catch(() => undefined);
      return;
    }
    // The gate names the rules and terms; violation reports need the rules.
    this.gate.load();
  }

  protected passGate(): void {
    this.gate.acknowledge();
    this.gatePassed.set(true);
  }

  protected chooseTriage(choice: ReportTriage): void {
    this.triage.set(choice);
    this.error.set('');
    if (choice === 'dontWant') {
      this.altResult.set(null);
      this.phase.set('alternatives');
      return;
    }
    if (choice !== 'report') this.setCategory(choice);
    this.phase.set('details');
  }

  protected backToTriage(): void {
    this.phase.set('triage');
  }

  protected setCategory(category: string): void {
    this.category.set(category);
    if (category === 'violation' && !this.isBluesky()) {
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

  protected muteAuthor(): void {
    const target = this.moderationTarget();
    if (!target) return;
    this.authorModeration.mute(target, null).subscribe({
      next: () => this.altResult.set('done'),
      error: () => this.altResult.set('failed'),
    });
  }

  protected blockAuthor(): void {
    const target = this.moderationTarget();
    if (!target) return;
    this.authorModeration.block(target).subscribe({
      next: () => this.altResult.set('done'),
      error: () => this.altResult.set('failed'),
    });
  }

  protected hidePost(): void {
    const id = this.statusId();
    if (!id) return;
    this.mutedPosts.mute(id);
    this.altResult.set('done');
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
    if (this.isBluesky()) {
      const reason = this.bskyReason();
      const labeler = this.bskySendTo() || undefined;
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
        ? this.blueskyApi.reportPost(ref.uri, ref.cid, reason, this.comment(), labeler)
        : this.blueskyApi.reportAccount(did, reason, this.comment(), labeler);
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
