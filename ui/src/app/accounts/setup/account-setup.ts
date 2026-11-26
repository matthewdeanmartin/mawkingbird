import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  ChangeDetectionStrategy,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { MbButton } from '../../design-system/button/button';
import { MbProgress } from '../../design-system/progress/progress';
import { MbNotice } from '../../design-system/notice/notice';
import { Auth } from '../../platform/session/auth';
import { Server } from '../../platform/http/server';
import { takeLoginNext } from '../../platform/session/login-destination';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { brandLogoSrc } from '../../platform/build/build-flavor';
import { environment } from '../../../environments/environment';
import { withAnswered } from './setup-flow';
import { setupStep } from './setup-steps';
import { SetupState } from './setup-state';
import { SetupPurpose } from './steps/setup-purpose';
import { SetupProfile } from './steps/setup-profile';
import { SetupLanguages } from './steps/setup-languages';
import { SetupFindable } from './steps/setup-findable';
import { SetupMovers } from './steps/setup-movers';
import { SetupTwitter } from './steps/setup-twitter';
import { SetupBluesky } from './steps/setup-bluesky';
import { SetupFollow } from './steps/setup-follow';
import { SetupIntro } from './steps/setup-intro';
import { SetupBlueskyProfile } from './steps/setup-bluesky-profile';
import { SetupBlueskyFollow } from './steps/setup-bluesky-follow';
import { SetupBlueskyIntro } from './steps/setup-bluesky-intro';

/**
 * Full-page setup for a Mastodon or Bluesky account that is minutes old
 * (spec/new-account-setup.md; Bluesky: spec/bsky_parity.md, sprint 2). It sits outside the shell on purpose: no rails,
 * no menus, only the logo and a quiet "Exit setup", so the person is walked
 * through without distraction but never trapped.
 *
 * Each step is its own URL (`/setup/<id>`) so the router-driven GoatCounter
 * counter sees the funnel with no extra events.
 */
@Component({
  selector: 'app-account-setup',
  imports: [
    MbButton,
    MbProgress,
    MbNotice,
    SetupPurpose,
    SetupProfile,
    SetupLanguages,
    SetupFindable,
    SetupMovers,
    SetupTwitter,
    SetupBluesky,
    SetupFollow,
    SetupIntro,
    SetupBlueskyProfile,
    SetupBlueskyFollow,
    SetupBlueskyIntro,
  ],
  providers: [SetupState],
  templateUrl: './account-setup.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './account-setup.css',
})
export class AccountSetup {
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);
  private readonly prefs = inject(ClientPrefs);
  private readonly server = inject(Server);
  protected readonly state = inject(SetupState);

  protected readonly brand = environment.brand;
  protected readonly logoSrc = computed(() => brandLogoSrc(this.prefs.artStyle()));
  protected readonly handle = computed(() => {
    const account = this.auth.account();
    if (!account) return '';
    // A Bluesky handle is already a whole domain.
    if (this.state.network() === 'bluesky') return `@${account.acct}`;
    const host = new URL(this.server.baseUrl() || location.origin).host;
    return account.acct.includes('@') ? `@${account.acct}` : `@${account.acct}@${host}`;
  });

  private readonly stepParam = toSignal(
    inject(ActivatedRoute).paramMap.pipe(map((params) => params.get('step'))),
    { initialValue: null },
  );

  /** The step on screen; null while redirecting to a valid one. */
  protected readonly step = computed(() => {
    const id = this.stepParam();
    return id && this.state.flow().isVisible(id) ? setupStep(id)! : null;
  });
  protected readonly progress = computed(() => {
    const step = this.step();
    return step ? this.state.flow().progress(step.id) : { index: 0, total: 0 };
  });
  protected readonly isFirst = computed(() => {
    const step = this.step();
    return !step || this.state.flow().before(step.id) === null;
  });
  protected readonly isDone = computed(() => this.step()?.id === 'done');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  private readonly heading = viewChild<ElementRef<HTMLElement>>('heading');

  constructor() {
    this.state.checkAccount();
    // `/setup`, an unknown id, or a step hidden by an earlier answer: go to
    // where this account should resume.
    effect(() => {
      if (this.step()) return;
      void this.router.navigate(['/setup', this.state.flow().resumeAt()], { replaceUrl: true });
    });
    // Each step is a new page for a screen reader: land on its heading.
    effect(() => {
      if (this.step()) this.heading()?.nativeElement.focus();
    });
  }

  /** Apply what this step chose, record it, and go on. */
  protected async next(): Promise<void> {
    const step = this.step();
    if (!step || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.state.commit?.();
    } catch {
      this.busy.set(false);
      const who = this.state.network() === 'bluesky' ? 'Bluesky' : 'Your server';
      this.error.set(`${who} didn’t accept this change. Try again, or skip this step.`);
      return;
    }
    this.busy.set(false);
    this.advance(step.id);
  }

  /** Leave this step's settings as they were and go on. */
  protected skip(): void {
    const step = this.step();
    if (step && !this.busy()) this.advance(step.id);
  }

  private advance(id: string): void {
    this.error.set('');
    this.state.save({ answered: withAnswered(this.state.record().answered, id) });
    const after = this.state.flow().after(id);
    if (after) void this.router.navigate(['/setup', after]);
    else this.finish();
  }

  protected back(): void {
    const step = this.step();
    const before = step && this.state.flow().before(step.id);
    if (before) {
      this.error.set('');
      void this.router.navigate(['/setup', before]);
    }
  }

  /** Leave setup. Progress stays; Settings → Public profile resumes it. */
  protected exit(): void {
    void this.router.navigateByUrl(takeLoginNext());
  }

  private finish(): void {
    this.state.save({ state: 'finished' });
    // Home, or the page whose sign-in turned into a sign-up.
    void this.router.navigateByUrl(takeLoginNext());
  }
}
