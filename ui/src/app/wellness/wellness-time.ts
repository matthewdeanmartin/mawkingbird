import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { filter } from 'rxjs';
import { MbDialog } from '../design-system/dialog/dialog';
import { MbButton } from '../design-system/button/button';
import { Auth } from '../platform/session/auth';
import { FeatureFlags } from '../platform/build/feature-flags';
import { Wellness } from './wellness';
import { UsageClock } from './usage-clock';
import { BreakReminders } from './break-reminders';

/** English source strings; see scripts/extract-i18n.mjs. */
// i18n wellness.checkIn.title: What are you here for?
// i18n wellness.checkIn.close: Just looking
// i18n wellness.checkIn.catchUp: Catch up on people I follow
// i18n wellness.checkIn.notifications: Check my notifications
// i18n wellness.checkIn.post: Post something
// i18n wellness.checkIn.browse: Read Home
// i18n wellness.checkIn.budget: For about
// i18n wellness.checkIn.budget.none: as long as it takes
// i18n wellness.checkIn.budget.minutes: {{count}} minutes
// i18n wellness.break.sitting: You've been here {{count}} minutes. This is a natural place to stop.
// i18n wellness.break.budget: That's the {{count}} minutes you planned.
// i18n wellness.break.done: Done for now
// i18n wellness.break.keepGoing: Keep going
// i18n wellness.break.rest: Nice. See you later.

/** Where an "opening the app" check-in may appear: the front doors, not a shared link. */
const FRONT_DOORS = new Set(['/', '/home']);

/** Away this long, coming back counts as opening the app again. */
const RETURN_AFTER_MINUTES = 60;

const BUDGETS = [0, 10, 20, 30] as const;

interface Intent {
  key: string;
  link: string;
}

/**
 * Wellness's time-aware parts, mounted once in the shell: the check-in on
 * opening, the break suggestion at natural stops, and the auto-grayscale fade.
 * Renders nothing unless one of those is on.
 */
@Component({
  selector: 'app-wellness-time',
  imports: [MbButton, MbDialog, TranslocoPipe],
  template: `
    @if (checkInOpen()) {
      <mb-dialog
        [title]="'wellness.checkIn.title' | transloco"
        [closeLabel]="'wellness.checkIn.close' | transloco"
        (dismissed)="choose(null)"
      >
        <div class="intents">
          @for (intent of intents(); track intent.key) {
            <button
              mbButton
              variant="outline"
              type="button"
              [attr.data-intent]="intent.key"
              (click)="choose(intent)"
            >
              {{ 'wellness.checkIn.' + intent.key | transloco }}
            </button>
          }
        </div>
        <label class="budget">
          {{ 'wellness.checkIn.budget' | transloco }}
          <select name="check_in_budget" (change)="budget.set(+$any($event.target).value)">
            @for (minutes of budgets; track minutes) {
              <option [value]="minutes" [selected]="minutes === budget()">
                @if (minutes) {
                  {{ 'wellness.checkIn.budget.minutes' | transloco: { count: minutes } }}
                } @else {
                  {{ 'wellness.checkIn.budget.none' | transloco }}
                }
              </option>
            }
          </select>
        </label>
      </mb-dialog>
    }
    @if (breaks.suggestion(); as reason) {
      <aside class="break" role="status">
        @if (resting()) {
          <p>{{ 'wellness.break.rest' | transloco }}</p>
        } @else {
          <p>
            @if (reason === 'budget') {
              {{ 'wellness.break.budget' | transloco: { count: plannedMinutes() } }}
            } @else {
              {{ 'wellness.break.sitting' | transloco: { count: clock.sittingMinutes() } }}
            }
          </p>
          <div class="actions">
            <button mbButton type="button" (click)="rest()">
              {{ 'wellness.break.done' | transloco }}
            </button>
            <button mbButton variant="outline" type="button" (click)="breaks.dismiss()">
              {{ 'wellness.break.keepGoing' | transloco }}
            </button>
          </div>
        }
      </aside>
    }
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .intents {
      display: grid;
      gap: 8px;
    }
    .budget {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-top: 16px;
    }
    .break {
      position: fixed;
      inset: auto 16px 16px;
      z-index: 50;
      max-width: 26rem;
      margin: 0 auto;
      padding: 14px 16px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: var(--bg);
      color: var(--text);
      box-shadow: 0 6px 24px rgb(0 0 0 / 18%);
    }
    .break p {
      margin: 0 0 10px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
  `,
})
export class WellnessTime {
  protected clock = inject(UsageClock);
  protected breaks = inject(BreakReminders);
  private wellness = inject(Wellness);
  private router = inject(Router);
  private auth = inject(Auth);
  private flags = inject(FeatureFlags);

  protected readonly budgets = BUDGETS;
  protected readonly checkInOpen = signal(false);
  protected readonly budget = signal(0);
  protected readonly resting = signal(false);
  protected readonly plannedMinutes = signal(0);

  protected readonly intents = computed<Intent[]>(() => [
    { key: 'catchUp', link: '/algo/catch-up' },
    { key: 'notifications', link: '/notifications' },
    ...(this.flags.enabled('write') ? [{ key: 'post', link: '/write' }] : []),
    { key: 'browse', link: '/home' },
  ]);

  constructor() {
    // The fade: a CSS variable the global rule reads (styles.css).
    effect(() => {
      const level = this.clock.gray();
      const root = document.documentElement;
      root.toggleAttribute('data-wellness-fade', level > 0);
      if (level > 0) root.style.setProperty('--wellness-gray', String(level));
      else root.style.removeProperty('--wellness-gray');
    });

    let first = true;
    const navigations = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        const path = (event as NavigationEnd).urlAfterRedirects.split(/[?#]/, 1)[0];
        if (first) {
          first = false;
          if (FRONT_DOORS.has(path)) this.maybeCheckIn();
          return;
        }
        // Between pages is between posts: a natural stop.
        this.breaks.naturalStop();
      });

    const visibility = (): void => {
      if (document.visibilityState !== 'visible') return;
      const away = this.clock.awayMinutes();
      if (away !== null && away >= RETURN_AFTER_MINUTES) this.maybeCheckIn();
    };
    document.addEventListener('visibilitychange', visibility);
    // Native: a desktop window comes back by regaining focus, not visibility.
    window.addEventListener('focus', visibility);
    inject(DestroyRef).onDestroy(() => {
      navigations.unsubscribe();
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('focus', visibility);
    });
  }

  private maybeCheckIn(): void {
    if (!this.wellness.flags().checkIn || this.auth.isAnonymous) return;
    this.budget.set(0);
    this.checkInOpen.set(true);
  }

  protected choose(intent: Intent | null): void {
    this.checkInOpen.set(false);
    const planned = intent ? this.budget() : 0;
    this.plannedMinutes.set(planned);
    this.breaks.setBudget(planned || null);
    if (intent) void this.router.navigateByUrl(intent.link);
  }

  protected rest(): void {
    this.resting.set(true);
    setTimeout(() => {
      this.resting.set(false);
      this.breaks.dismiss();
    }, 4000);
  }
}
