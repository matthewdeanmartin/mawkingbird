import {
  Component,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { BugReport } from '../../platform/diagnostics/bug-report';
import { ErrorLog } from '../../platform/diagnostics/error-log';
import { MbDialog } from '../../design-system/dialog/dialog';
import { MbButton } from '../../design-system/button/button';
import { MbField, MbControl } from '../../design-system/field/field';
import { MbCheckbox } from '../../design-system/checkbox/checkbox';
import { MbDisclosure } from '../../design-system/disclosure/disclosure';
import { DiagnosticLog } from '../../platform/diagnostics/diagnostic-log';

import { postLength } from '../../publishing/compose/post-length';
import { firstValueFrom } from 'rxjs';
import { TranslocoService } from '@jsverse/transloco';
import { Api } from '../../platform/api/api';
import { Auth } from '../../platform/session/auth';
import { Server } from '../../platform/http/server';
import { feedbackTargets } from '../../platform/diagnostics/feedback-targets';
type Destination = 'github' | 'social' | 'email' | 'copy';

// i18n bugReport.title: Feedback
// i18n bugReport.intro: Describe a problem or suggestion, then choose where to send it.
// i18n bugReport.whatHappened: What happened?
// i18n bugReport.descriptionPlaceholder: What were you doing, and what went wrong?
// i18n bugReport.includeErrors.one: Include the {{count}} most recent error captured in this tab
// i18n bugReport.includeErrors.other: Include the {{count}} most recent errors captured in this tab
// i18n bugReport.includeDiagnostics: Include up to 100 recent diagnostic entries from this tab
// i18n bugReport.toggle.hide: Hide exactly what will be included
// i18n bugReport.toggle.show: Show exactly what will be included
// i18n bugReport.close: Close
// i18n bugReport.copied: Copied ✓
// i18n bugReport.copyReport: Copy report
// i18n bugReport.openGithubIssue: Open GitHub issue
// i18n feedback.kind: Feedback type
// i18n feedback.bug: Bug report
// i18n feedback.feature: Feature request
// i18n feedback.access: Accessibility
// i18n feedback.language: Translation or wording
// i18n feedback.docs: Help or documentation
// i18n feedback.other: Other feedback
// i18n feedback.security: Security or privacy
// i18n feedback.details: Your feedback
// i18n feedback.featurePrompt: What would you like to do?
// i18n feedback.destination: Send feedback via
// i18n feedback.github: GitHub issue (public, GitHub account required)
// i18n feedback.advisory: Private security reporting page
// i18n feedback.social: Mastodon mention (public)
// i18n feedback.direct: Mastodon message (mentioned accounts only)
// i18n feedback.publicAudience: Public post
// i18n feedback.publicAudienceHint: Your feedback will be posted publicly on Mastodon. Anyone can read it.
// i18n feedback.directAudience: Direct message
// i18n feedback.email: Email
// i18n feedback.copy: Copy feedback
// i18n feedback.environment: Include build, browser, server and page details
// i18n feedback.cc: Also mention {{handle}}
// i18n feedback.poll: Add a poll for the maximum duration allowed by my server
// i18n feedback.pollHint: Poll answers: {{answers}}. Duration: {{seconds}} seconds.
// i18n feedback.send: Post on Mastodon
// i18n feedback.sent: Posted. You can also send this feedback using another destination above.
// i18n feedback.handoff: After finishing there, return here to send the same feedback another way.
// i18n feedback.directHint: Only the listed recipient will be mentioned. Server administrators may be able to read direct messages.
// i18n feedback.extraMention: Remove @ signs from the message body to keep the recipient list private.
// i18n feedback.signIn: To post here, use a connected Mastodon account. You can also copy this draft to your Mastodon client and select the indicated audience.
// i18n feedback.reconnect: Reconnect your Mastodon account with Full access to post, or copy the draft into your Mastodon client.
// i18n feedback.mailCopy: Copy the report text, then paste it into the email draft.
// i18n feedback.failed: Could not confirm posting. Your draft is still here.
// i18n feedback.available: Copy your feedback to send it yourself.
// i18n feedback.openSecurity: Open private reporting page
// i18n feedback.emailAction: Open email draft
// i18n feedback.securityHint: Copy your text before opening the private reporting page.
// i18n feedback.from: Posting as {{account}}
// i18n feedback.mailTo: To {{address}}
// i18n feedback.githubAction: Open GitHub issue
// i18n feedback.review: Review the message
// i18n feedback.retry: Report this problem
// i18n feedback.sending: Posting…
// i18n feedback.noPoll: Your server has not supplied a maximum poll duration.
// i18n feedback.copyFailed: Select and copy the preview text manually.
// i18n feedback.alsoGithub: Also file a GitHub issue
// i18n feedback.alsoSocial: Also post on Mastodon
// i18n feedback.yes: Yes
// i18n feedback.no: No
@Component({
  selector: 'app-bug-report-dialog',
  imports: [
    MbDialog,
    MbButton,
    MbField,
    MbControl,
    MbCheckbox,
    MbDisclosure,
    FormsModule,
    TranslocoPipe,
  ],
  templateUrl: './bug-report-dialog.html',
  styleUrl: './bug-report-dialog.css',
})
export class BugReportDialog {
  private readonly report = inject(BugReport);
  protected readonly errorLog = inject(ErrorLog);
  protected readonly diagnosticLog = inject(DiagnosticLog);

  readonly closed = output<void>();

  private readonly api = inject(Api);
  protected readonly auth = inject(Auth);
  private readonly server = inject(Server);
  private readonly i18n = inject(TranslocoService);
  protected readonly targets = inject(feedbackTargets);
  readonly initialDescription = input('');
  protected readonly description = linkedSignal(() => this.initialDescription());
  protected readonly kinds = ['bug', 'feature', 'access', 'language', 'docs', 'other', 'security'];
  protected readonly kind = signal('bug');
  protected readonly security = computed(() => this.kind() === 'security');
  protected readonly destinations = computed<Destination[]>(() => {
    const choices: Destination[] = [];
    if (this.security() ? this.targets.securityUrl : this.targets.repository)
      choices.push('github');
    if (this.targets.account) choices.push('social');
    if (this.targets.email) choices.push('email');
    return choices.length ? choices : ['copy'];
  });
  protected readonly destination = linkedSignal(() => this.destinations()[0]);
  protected includeErrors = signal(false);
  protected includeEnvironment = signal(false);
  protected includeDiagnostics = signal(false);
  protected showDetails = signal(false);
  protected copied = signal(false);
  protected handoff = signal(false);
  protected cc = signal(false);
  protected poll = signal(false);
  protected busy = signal(false);
  protected result = signal('');
  protected readonly hasErrors = computed(() => this.errorLog.entries().length > 0);
  protected readonly hasDiagnostics = computed(() => this.diagnosticLog.entries().length > 0);
  protected readonly canPost = computed(
    () => this.auth.kind() === 'mastodon' && !!this.auth.account() && !this.server.isMock,
  );
  protected readonly maxPoll = signal(0);
  protected readonly maxLength = signal(500);
  private lastAttempt?: { payload: string; key: string };
  private readonly posted = signal('');
  protected readonly pollEnabled = computed(
    () => this.kind() === 'feature' && this.poll() && this.maxPoll() > 0,
  );
  protected readonly pollAnswers = computed(() => [
    this.i18n.translate('feedback.yes'),
    this.i18n.translate('feedback.no'),
  ]);
  protected readonly message = computed(() =>
    [
      this.targets.account,
      !this.security() && this.cc() && this.targets.maintainer !== this.targets.account
        ? this.targets.maintainer
        : '',
      this.security() ? '' : this.i18n.translate(this.categoryKey()) + ' —',
      this.description().trim(),
    ]
      .filter(Boolean)
      .join(' '),
  );
  protected readonly extraMention = computed(
    () => this.security() && /[@＠]/u.test(this.description()),
  );
  protected readonly payload = computed(() =>
    JSON.stringify([
      this.auth.account()?.id,
      this.server.baseUrl(),
      this.message(),
      this.security(),
      this.pollEnabled() ? [this.maxPoll(), this.pollAnswers()] : null,
    ]),
  );
  protected readonly length = computed(() => postLength(this.message()));
  protected readonly postable = computed(
    () =>
      this.canPost() &&
      !!this.description().trim() &&
      !this.busy() &&
      !this.extraMention() &&
      this.length() <= this.maxLength() &&
      this.posted() !== this.payload(),
  );
  constructor() {
    effect((cleanup) => {
      this.maxPoll.set(0);
      this.maxLength.set(500);
      if (this.destination() !== 'social' || !this.canPost()) return;
      this.server.baseUrl();
      const subscription = this.api.instanceInfo().subscribe({
        next: ({ configuration }) => {
          this.maxPoll.set(configuration?.polls?.max_expiration ?? 0);
          this.maxLength.set(configuration?.statuses?.max_characters ?? 500);
        },
        error: () => this.maxPoll.set(0),
      });
      cleanup(() => subscription.unsubscribe());
    });
  }

  private readonly categoryKey = computed(() => 'feedback.' + this.kind());
  private readonly reportInput = computed(() => ({
    description: this.description(),
    category: this.kind() === 'bug' ? undefined : this.i18n.translate(this.categoryKey()),
    includeEnvironment: this.kind() === 'bug' && this.includeEnvironment(),
    includeErrors: this.kind() === 'bug' && this.includeErrors(),
    includeDiagnostics: this.kind() === 'bug' && this.includeDiagnostics(),
  }));
  protected readonly preview = computed(() => {
    if (this.destination() === 'social') return this.message();
    if (this.security()) return this.description();
    return this.report.buildMarkdown(this.reportInput());
  });
  protected readonly emailNeedsCopy = computed(
    () => this.security() || encodeURIComponent(this.preview()).length > 1800,
  );
  protected readonly externalUrl = computed(() => {
    if (this.destination() === 'github') {
      if (this.security()) return this.targets.securityUrl;
      return (
        this.targets.repository &&
        this.report.buildGithubUrl(this.reportInput(), this.targets.repository)
      );
    }
    if (this.destination() === 'email' && this.targets.email) {
      const subject = encodeURIComponent(this.i18n.translate(this.categoryKey()));
      const body = this.emailNeedsCopy() ? '' : '&body=' + encodeURIComponent(this.preview());
      return 'mailto:' + this.targets.email + '?subject=' + subject + body;
    }
    return undefined;
  });

  async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.preview());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.showDetails.set(true);
      this.result.set('feedback.copyFailed');
    }
  }

  protected async post(): Promise<void> {
    if (this.destination() !== 'social' || !this.postable()) return;
    const payload = this.payload();
    if (this.lastAttempt?.payload !== payload)
      this.lastAttempt = { payload, key: crypto.randomUUID() };
    this.busy.set(true);
    this.result.set('');
    try {
      const nativeHandle = this.auth.token();
      if (nativeHandle?.startsWith('native-mastodon:')) {
        const request = {
          handle: nativeHandle,
          server: this.server.baseUrl(),
          post: {
            message: this.message(),
            direct: this.security(),
            key: this.lastAttempt.key,
            poll: this.pollEnabled()
              ? { options: this.pollAnswers(), expires_in: this.maxPoll() }
              : null,
          },
        };
        const { invokeSocial } = await import('../../platform/http/native-social-http');
        await invokeSocial('mastodon_feedback', request);
      } else {
        await firstValueFrom(
          this.api.postStatus(
            this.message(),
            {
              visibility: this.security() ? 'direct' : 'public',
              poll: this.pollEnabled()
                ? { options: this.pollAnswers(), expiresIn: this.maxPoll(), multiple: false }
                : undefined,
            },
            this.lastAttempt.key,
          ),
        );
      }
      this.posted.set(payload);
      this.result.set('feedback.sent');
    } catch (error) {
      const reconnect =
        typeof error === 'object' &&
        error !== null &&
        'kind' in error &&
        error.kind === 'reauthorize';
      this.result.set(reconnect ? 'feedback.reconnect' : 'feedback.failed');
    } finally {
      this.busy.set(false);
    }
  }
}
