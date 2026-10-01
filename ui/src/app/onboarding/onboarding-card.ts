import { MbButton } from '../design-system/button/button';
import {
  afterNextRender,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { Api } from '../api';
import { Auth } from '../auth';
import { ClientPrefs } from '../client-prefs';
import { FeatureFlags } from '../feature-flags';
import { UiLocale } from '../i18n/locale';
import { SupporterStatus } from '../providers/account/supporter-status';
import { AnonymousFollows } from '../providers/anonymous/anonymous-follows';
import { BlueskySession } from '../providers/bluesky/bluesky-session';
import { MastodonConnector } from '../providers/mastodon/mastodon-connector';
import { Pseudonymity } from '../pseudonymity';
import { KnownLanguages } from '../trend-language-filter';
import { TrustedAccounts } from '../trusted-accounts';
import { DONE, OnboardingFlow } from './onboarding-flow';
import { OnboardingLauncher } from './onboarding-launcher';
import {
  ACCENT_SWATCHES,
  ChoiceOption,
  ONBOARDING_QUESTIONS,
  OnboardingContext,
  OnboardingValue,
  plusRows,
} from './onboarding-questions';
import { MastodonOnboardingServer, NO_SERVER } from './onboarding-server';

/**
 * The onboarding wizard: one question per floating card.
 *
 * Non-blocking on purpose. There is no backdrop and no focus trap, because the
 * point of applying each answer immediately is that the reader can *see* it —
 * dark mode, a new colour, text-only posts — in the live app behind the card.
 *
 * English only; see the header of `onboarding-questions.ts`.
 */
@Component({
  imports: [MbButton],
  selector: 'app-onboarding-card',
  templateUrl: './onboarding-card.html',
  styleUrl: './onboarding-card.css',
  host: {
    role: 'dialog',
    'aria-modal': 'false',
    'aria-labelledby': 'onboarding-title',
    '(keydown.escape)': 'quit()',
  },
})
export class OnboardingCard {
  private readonly router = inject(Router);
  private readonly launcher = inject(OnboardingLauncher);
  private readonly injector = inject(Injector);
  private readonly auth = inject(Auth);
  private readonly prefs = inject(ClientPrefs);
  private readonly wantsLearning = signal(false);

  private readonly ctx: OnboardingContext = {
    auth: this.auth,
    prefs: this.prefs,
    pseudonymity: inject(Pseudonymity),
    trust: inject(TrustedAccounts),
    flags: inject(FeatureFlags),
    bsky: inject(BlueskySession),
    connector: inject(MastodonConnector),
    anonFollows: inject(AnonymousFollows),
    supporter: inject(SupporterStatus),
    locale: inject(UiLocale),
    known: inject(KnownLanguages),
    server: this.serverFor(),
    wantsLearning: this.wantsLearning.asReadonly(),
  };

  protected readonly flow = new OnboardingFlow(
    this.ctx,
    ONBOARDING_QUESTIONS,
    this.launcher.mode() ?? 'menu',
  );

  protected readonly done = DONE;
  protected readonly swatches = ACCENT_SWATCHES;
  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  constructor() {
    // Move focus to each new question, so keyboard and screen-reader users
    // land on it rather than on a button that has just been replaced.
    effect(() => {
      this.flow.currentId();
      afterNextRender(() => this.heading()?.nativeElement.focus({ preventScroll: true }), {
        injector: this.injector,
      });
    });
  }

  protected readonly scopeTag = computed(() => {
    switch (this.flow.current()?.scope) {
      case 'server':
        return 'Mastodon server setting';
      case 'app':
        return 'Mawkingbird setting · all accounts';
      case 'account':
        return 'Mawkingbird setting · this account';
      default:
        return '';
    }
  });

  protected title(): string {
    return this.flow.current()?.title(this.ctx) ?? '';
  }

  protected help(): string {
    return this.flow.current()?.help?.(this.ctx) ?? '';
  }

  protected options(): ChoiceOption[] {
    const control = this.flow.current()?.control;
    return control && (control.kind === 'choice' || control.kind === 'multi')
      ? control.options(this.ctx)
      : [];
  }

  protected plusRows() {
    return plusRows(this.ctx);
  }

  protected isMember(): boolean {
    return this.ctx.supporter.isSupporter();
  }

  protected isChosen(value: string): boolean {
    const current = this.flow.value();
    return Array.isArray(current) ? current.includes(value) : current === value;
  }

  protected pick(value: OnboardingValue): void {
    void this.flow.select(value);
  }

  protected toggleMulti(value: string): void {
    const current = this.flow.value();
    const list = Array.isArray(current) ? current : [];
    void this.flow.select(
      list.includes(value) ? list.filter((v) => v !== value) : [...list, value],
    );
  }

  protected learning(): void {
    this.wantsLearning.set(true);
    void this.flow.next();
  }

  protected next(): void {
    void this.flow.next();
  }

  protected skip(): void {
    void this.flow.skip();
  }

  protected back(): void {
    this.flow.back();
  }

  /** Leave for another page. Progress is kept; the menu entry picks it up. */
  protected go(route: string, finished = false): void {
    this.flow.answerCurrent();
    if (finished) this.flow.finish();
    this.launcher.close();
    void this.router.navigateByUrl(route);
  }

  protected quit(): void {
    this.launcher.close();
  }

  private serverFor() {
    if (this.auth.kind() !== 'mastodon' || !this.auth.token()) return NO_SERVER;
    const server = new MastodonOnboardingServer(inject(Api), this.prefs);
    server.load();
    return server;
  }
}
