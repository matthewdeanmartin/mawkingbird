import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { MbButton } from '../../design-system/button/button';
import { MbControl, MbField } from '../../design-system/field/field';
import { MbNotice } from '../../design-system/notice/notice';
import { MastodonServers, ServerSuggestion } from '../../mastodon-servers';
import { FocusedNextSteps } from '../focused-apps/focused-next-steps';
import { Availability, checkHandle, normalizeDomain, signUpUrl } from './handle-availability';
import { handleVariants } from './handle-variants';

type Status = Availability | 'checking';

interface Row {
  handle: string;
  status: Status;
}

interface BigServer {
  domain: string;
  users: number;
  /** Sign-ups need an admin's approval there; undefined when the directory didn't say. */
  approval?: boolean;
  status: Status;
}

/** The biggest servers in the joinmastodon directory, checked for a chosen handle. */
const BIG_SERVER_COUNT = 10;
/** Lookups in flight at once: quick, and gentle on any one server. */
const CONCURRENCY = 4;

/** The wizard's steps: your name, pick a handle, claim it, done. */
export type HandleStep = 1 | 2 | 3 | 4;
export const STEP_TITLES: Record<HandleStep, string> = {
  1: 'Your name',
  2: 'Pick a handle',
  3: 'Claim it',
  4: 'Done',
};

/**
 * The handle generator and checker. Runs signed out: the people looking for a
 * handle are the ones without an account yet, and the lookups need none.
 *
 * Suggestions are checked on the server the visitor means to join; the one they
 * pick is then checked on the biggest servers too, so a taken name on one
 * server can become a free name on another.
 *
 * A wizard, one step on screen at a time: name, pick, claim, done. Scrolling
 * one long page between a form, a list and a sign-up was easy to get lost in.
 * The step lives in the URL (`?step=`), so Next and Back are history entries
 * and a phone's Back button steps back rather than leaving the page. Each step
 * change brings the wizard into view and moves focus to the step's heading.
 */
@Component({
  selector: 'app-handle-workbench',
  imports: [FormsModule, RouterLink, FocusedNextSteps, MbButton, MbControl, MbField, MbNotice],
  templateUrl: './handle-workbench.html',
  styleUrl: './handle-workbench.css',
})
export class HandleWorkbench {
  private readonly directory = inject(MastodonServers);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly injector = inject(Injector);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly heading = viewChild<ElementRef<HTMLElement>>('stepHeading');

  /** Where the invite card points: the mini-app's own tab signed in, else the public builder. */
  readonly inviteLink = input('/invites');

  protected readonly name = signal('');
  protected readonly serverInput = signal('mastodon.social');
  protected readonly server = signal('');
  protected readonly rows = signal<Row[]>([]);
  protected readonly serverError = signal(false);
  protected readonly chosen = signal<string | null>(null);
  protected readonly big = signal<BigServer[]>([]);

  /** Guards against an older run writing into a newer one's results. */
  private run = 0;

  protected readonly suggestions = computed(() => handleVariants(this.name()));
  protected readonly checking = computed(() =>
    this.rows().some((row) => row.status === 'checking'),
  );
  protected readonly signUp = computed(() => signUpUrl(this.server()));

  /** The step the URL asks for. */
  private readonly requested = toSignal(
    this.route.queryParamMap.pipe(map((params) => Number(params.get('step')) || 1)),
    { initialValue: 1 },
  );

  /** The furthest step there is anything to show for. */
  private readonly reachable = computed<HandleStep>(() =>
    this.chosen() ? 4 : this.rows().length ? 2 : 1,
  );

  /**
   * The step on screen: what the URL asks for, but never past what has data.
   * A reload or a shared `?step=3` link has no picked handle, so it opens on
   * the furthest step that makes sense instead of an empty one.
   */
  protected readonly step = computed<HandleStep>(() => {
    const asked = Math.min(Math.max(this.requested(), 1), 4) as HandleStep;
    return asked === 4 && !this.done() ? 3 : (Math.min(asked, this.reachable()) as HandleStep);
  });

  protected readonly stepTitles = STEP_TITLES;
  protected readonly steps: readonly HandleStep[] = [1, 2, 3, 4];

  /** Set by Done; Back from the last step clears it. */
  private readonly done = signal(false);

  constructor() {
    void this.directory.ready();
    // Every step change after the first: bring the wizard into view and put
    // focus on the new step's heading, so the next thing to read is right there.
    let first = true;
    effect(() => {
      this.step();
      if (first) {
        first = false;
        return;
      }
      untracked(() => afterNextRender(() => this.showStep(), { injector: this.injector }));
    });
  }

  protected next(): void {
    this.find();
  }

  /**
   * Back one step. When the entry behind this one is the wizard's own, this is
   * the browser's Back, so the history stays in step with the screen; a page
   * opened straight on `?step=` has nothing of ours behind it, so it moves back
   * in place instead of leaving the page.
   */
  protected back(): void {
    const step = this.step();
    if (step === 4) this.done.set(false);
    if (step === 3) this.run++; // Stop the big-server checks for the abandoned pick.
    if ((history.state as { handleWizard?: boolean } | null)?.handleWizard) {
      history.back();
    } else {
      this.goTo((step - 1) as HandleStep, true);
    }
  }

  protected finish(): void {
    this.done.set(true);
    this.goTo(4);
  }

  protected startOver(): void {
    this.run++;
    this.rows.set([]);
    this.chosen.set(null);
    this.big.set([]);
    this.done.set(false);
    this.goTo(1);
  }

  private goTo(step: HandleStep, replaceUrl = false): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { step: step === 1 ? null : step },
      queryParamsHandling: 'merge',
      replaceUrl,
      // Marks the entry as the wizard's, for Back (see `back`).
      state: { handleWizard: true },
    });
  }

  private showStep(): void {
    const top = this.host.nativeElement.getBoundingClientRect().top;
    // Only when the wizard's top is out of view; a short step already on screen stays put.
    if (top < 0 || top > window.innerHeight * 0.5) {
      this.host.nativeElement.scrollIntoView({ block: 'start' });
    }
    this.heading()?.nativeElement.focus({ preventScroll: true });
  }

  protected find(): void {
    const domain = normalizeDomain(this.serverInput());
    this.serverError.set(!domain);
    const handles = this.suggestions();
    if (!domain || !handles.length) return;
    const run = ++this.run;
    this.server.set(domain);
    this.chosen.set(null);
    this.big.set([]);
    this.rows.set(handles.map((handle) => ({ handle, status: 'checking' })));
    this.goTo(2);
    void inBatches(handles, CONCURRENCY, async (handle) => {
      const status = await checkHandle(domain, handle);
      if (run !== this.run) return;
      this.rows.update((rows) =>
        rows.map((row) => (row.handle === handle ? { ...row, status } : row)),
      );
    });
  }

  /** Pick a handle: check it on the biggest servers, and offer the sign-up. */
  protected async choose(handle: string): Promise<void> {
    const run = ++this.run;
    this.chosen.set(handle);
    this.big.set([]);
    this.done.set(false);
    this.goTo(3);
    await this.directory.ready();
    if (run !== this.run) return;
    const servers = biggest(this.directory.servers(), this.server());
    this.big.set(
      servers.map((entry) => ({
        domain: entry.domain,
        users: entry.users,
        approval: entry.approvalRequired,
        status: 'checking',
      })),
    );
    await inBatches(servers, CONCURRENCY, async (entry) => {
      const status = await checkHandle(entry.domain, handle);
      if (run !== this.run) return;
      this.big.update((rows) =>
        rows.map((row) => (row.domain === entry.domain ? { ...row, status } : row)),
      );
    });
  }

  protected label(status: Status): string {
    switch (status) {
      case 'free':
        return 'Looks free';
      case 'taken':
        return 'Taken';
      case 'unknown':
        return "Couldn't check";
      default:
        return 'Checking…';
    }
  }

  protected signUpOn(domain: string): string {
    return signUpUrl(domain);
  }

  protected users(count: number): string {
    return count >= 1000 ? `${Math.round(count / 1000)}k people` : `${count} people`;
  }
}

/** The biggest directory servers by sign-ups, leaving out the one already checked. */
function biggest(servers: readonly ServerSuggestion[], exclude: string): ServerSuggestion[] {
  return [...servers]
    .filter((entry) => !entry.local && entry.domain !== exclude)
    .sort((a, b) => b.users - a.users)
    .slice(0, BIG_SERVER_COUNT);
}

/** Run `task` over `items`, at most `size` at a time. */
async function inBatches<T>(items: readonly T[], size: number, task: (item: T) => Promise<void>) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await task(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker));
}
