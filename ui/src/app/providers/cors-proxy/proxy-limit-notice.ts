import {
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injectable,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { FeatureFlags } from '../../feature-flags';
import { PlusBadgeEntitlement } from '../account/plus-badge-entitlement';
import { PlusPrice } from '../account/plus-price';
import { ProxyActivity } from './proxy-activity';

// i18n proxy.limit.title: Some updates are paused
// i18n proxy.limit.body: A temporary request limit was reached. Your saved content is still available.
// i18n proxy.limit.offerTitle: Get a higher allowance with Plus
// i18n proxy.limit.offerBody: You’ve temporarily reached the free request limit. Mawkingbird Plus provides a higher allowance.
// i18n proxy.limit.networkBody: Your network has temporarily reached its shared free request limit. Plus provides a higher allowance for your account.
// i18n proxy.limit.retry: Try again in about {{seconds}} seconds.
// i18n proxy.limit.explore: Explore Plus
// i18n proxy.limit.dismiss: Dismiss
// i18n proxy.limit.notNow: Not now
// i18n proxy.limit.dailyTitle: Your free proxy allowance is used up
// i18n proxy.limit.anonymousDaily: Anonymous browsing includes 1 proxy request per day. Create an account for 5 daily requests, or sign up for Mawkingbird Plus.
// i18n proxy.limit.accountDaily: Your account includes 5 free proxy requests per day. Sign up for Mawkingbird Plus for a higher allowance, or quietly disable all features that need the CORS proxy.
// i18n proxy.limit.destinationTitle: This site requires Mawkingbird Plus
// i18n proxy.limit.domains: Free proxy access covers Wikipedia, Wikimedia, Wikisource, Project Gutenberg and Internet Archive, including their subdomains. Other sites require Plus.
// i18n proxy.limit.createAccount: Create an account or sign in
// i18n proxy.limit.disable: Quietly disable all features that need the CORS proxy
// i18n proxy.limit.resetDaily: Your free allowance resets at midnight UTC.
// i18n proxy.limit.email: Email address
// i18n proxy.limit.sendLink: Send sign-in link
// i18n proxy.limit.linkSent: Check your email for a link to create your account or sign in.
// i18n proxy.limit.linkFailed: Could not send the sign-in link. Please try again.
// i18n proxy.limit.plusUnavailable: Plus signup is currently unavailable.

/** Load account code only when someone asks to sign in. */
@Injectable({ providedIn: 'root' })
export class ProxyAccountSignup {
  private injector = inject(Injector);
  async send(email: string): Promise<boolean> {
    const { MawkingbirdSession } = await import('../account/mawkingbird-session');
    return this.injector.get(MawkingbirdSession).requestSignInLink(email, location.pathname);
  }
}
@Component({
  selector: 'app-proxy-limit-notice',
  imports: [RouterLink, TranslocoPipe, PlusPrice],
  template: `
    <dialog #dialog (cancel)="activity.dismissNotice()" aria-labelledby="proxy-free-title">
      @if (showDialog()) {
        <h2 id="proxy-free-title">
          {{
            (activity.details()?.cause === 'destination_policy'
              ? 'proxy.limit.destinationTitle'
              : 'proxy.limit.dailyTitle'
            ) | transloco
          }}
        </h2>
        <p>
          {{
            (activity.details()?.identity === 'account'
              ? 'proxy.limit.accountDaily'
              : 'proxy.limit.anonymousDaily'
            ) | transloco
          }}
        </p>
        <p>{{ 'proxy.limit.domains' | transloco }}</p>
        @if (activity.details()?.allowance === 'daily') {
          <p>{{ 'proxy.limit.resetDaily' | transloco }}</p>
        }
        @if (activity.details()?.identity !== 'account') {
          <button class="btn" type="button" (click)="signupOpen.set(true)">
            {{ 'proxy.limit.createAccount' | transloco }}
          </button>
          @if (signupOpen()) {
            <form (submit)="createAccount($event, email.value)">
              <label for="proxy-signup-email">{{ 'proxy.limit.email' | transloco }}</label>
              <input #email id="proxy-signup-email" type="email" autocomplete="email" required />
              <button class="btn" type="submit" [disabled]="sending()">
                {{ 'proxy.limit.sendLink' | transloco }}
              </button>
              @if (signupStatus()) {
                <p role="status">{{ signupStatus() | transloco }}</p>
              }
            </form>
          }
        }
        @if (plusAvailable()) {
          <a
            class="btn"
            routerLink="/settings/mawkingbird-plus"
            (click)="activity.dismissNotice()"
            >{{ 'plus.wall.signUp' | transloco }}</a
          >
        } @else {
          <p>{{ 'proxy.limit.plusUnavailable' | transloco }}</p>
        }
        <p>{{ 'plus.wall.affected' | transloco }}</p>
        <button class="btn btn-outline" type="button" (click)="disableProxy()">
          {{ 'proxy.limit.disable' | transloco }}
        </button>
        <button class="btn btn-outline" type="button" (click)="activity.dismissNotice()">
          {{ 'proxy.limit.notNow' | transloco }}
        </button>
      }
    </dialog>
    @if (activity.notice() && !activity.paused() && !showDialog()) {
      <aside
        class="limit-notice"
        [class.toast]="!showOffer()"
        aria-label="{{ 'proxy.limit.title' | transloco }}"
      >
        <div role="status">
          <strong>{{
            (showOffer() ? 'proxy.limit.offerTitle' : 'proxy.limit.title') | transloco
          }}</strong>
          <p>
            {{
              (showOffer()
                ? activity.details()?.identity === 'ip'
                  ? 'proxy.limit.networkBody'
                  : 'proxy.limit.offerBody'
                : 'proxy.limit.body'
              ) | transloco
            }}
          </p>
        </div>
        @if (showOffer()) {
          <app-plus-price />
        }
        <!-- Keep the changing countdown out of the live region. -->
        <p class="small muted">
          {{ 'proxy.limit.retry' | transloco: { seconds: activity.remainingSeconds() } }}
        </p>
        <div class="actions">
          @if (showOffer()) {
            <a
              class="btn"
              routerLink="/settings/mawkingbird-plus"
              (click)="activity.dismissNotice()"
              >{{ 'proxy.limit.explore' | transloco }}</a
            >
          }
          <button class="btn btn-outline" type="button" (click)="activity.dismissNotice()">
            {{ (showOffer() ? 'proxy.limit.notNow' : 'proxy.limit.dismiss') | transloco }}
          </button>
        </div>
      </aside>
    }
  `,
  styles: `
    dialog {
      width: min(32rem, calc(100vw - 2rem));
      max-height: 85vh;
      overflow: auto;
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 1.5rem;
      background: var(--bg, white);
      color: var(--text, black);
    }
    dialog::backdrop {
      background: #0008;
    }
    dialog .btn {
      margin: 0.4rem;
    }
    .limit-notice {
      padding: 1rem;
      margin: 0.75rem;
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      background: var(--accent-soft, var(--bg));
      color: var(--text);
    }
    .toast {
      position: fixed;
      inset-inline-end: 1rem;
      bottom: calc(1rem + env(safe-area-inset-bottom));
      z-index: 100;
      width: min(28rem, calc(100vw - 2rem));
      box-sizing: border-box;
      max-height: 50vh;
      overflow: auto;
      margin: 0;
      background: var(--bg);
      box-shadow: 0 4px 16px #0003;
    }
    p {
      margin: 0.5rem 0;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }
  `,
})
export class ProxyLimitNotice {
  readonly activity = inject(ProxyActivity);
  private flags = inject(FeatureFlags);
  private entitlement = inject(PlusBadgeEntitlement);
  private offered = signal(false);
  readonly signupOpen = signal(false);
  readonly sending = signal(false);
  readonly signupStatus = signal('');
  private signup = inject(ProxyAccountSignup);
  readonly plusAvailable = computed(() => this.flags.enabled('mawkingbird-plus'));
  private policyRefusal = computed(
    () =>
      this.activity.details()?.tier === 'free' &&
      (this.activity.details()?.allowance === 'daily' ||
        this.activity.details()?.cause === 'destination_policy'),
  );
  private eligible = computed(
    () =>
      this.activity.upgradeEligible() &&
      (this.policyRefusal()
        ? this.entitlement.state() !== 'plus'
        : this.plusAvailable() && this.entitlement.state() === 'free'),
  );
  readonly showOffer = computed(() => this.offered() && this.eligible());
  readonly showDialog = computed(
    () =>
      this.showOffer() &&
      this.activity.notice() &&
      !this.activity.paused() &&
      (this.activity.details()?.allowance === 'daily' ||
        this.activity.details()?.cause === 'destination_policy'),
  );
  private dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private previous: HTMLElement | null = null;

  constructor() {
    effect(() => {
      const dialog = this.dialog()?.nativeElement;
      if (!dialog) return;
      if (this.showDialog() && !dialog.open) {
        this.previous = document.activeElement as HTMLElement;
        dialog.showModal();
      } else if (!this.showDialog() && dialog.open) {
        dialog.close();
        this.previous?.focus();
      }
    });
    effect(() => {
      if (!this.activity.notice() || this.activity.paused()) {
        this.offered.set(false);
        return;
      }
      if (this.flags.enabled('mawkingbird-plus')) void this.entitlement.check();
      // Claim the session's offer only when it can actually be displayed.
      if (!this.offered() && this.eligible() && this.activity.claimPrompt()) this.offered.set(true);
    });
  }
  disableProxy(): void {
    this.activity.setPaused(true);
    this.activity.dismissNotice();
  }
  async createAccount(event: Event, email: string): Promise<void> {
    event.preventDefault();
    if (this.sending()) return;
    this.sending.set(true);
    this.signupStatus.set('');
    try {
      this.signupStatus.set(
        (await this.signup.send(email)) ? 'proxy.limit.linkSent' : 'proxy.limit.linkFailed',
      );
    } catch {
      this.signupStatus.set('proxy.limit.linkFailed');
    } finally {
      this.sending.set(false);
    }
  }
}
