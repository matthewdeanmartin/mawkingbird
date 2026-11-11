import { computed, signal } from '@angular/core';
import { OnboardingOpenMode } from './onboarding-launcher';
import { OnboardingContext, OnboardingQuestion, OnboardingValue } from './onboarding-questions';
import {
  emptyOnboardingAccount,
  OnboardingAccountRecord,
  OnboardingAppRecord,
  readOnboardingAccount,
  readOnboardingApp,
  writeOnboardingAccount,
  writeOnboardingApp,
} from './onboarding-store';

/** The id of the closing card, which is not a question. */
export const DONE = 'done';

export const SERVER_REFUSED = "Your server didn't accept this change.";

const same = (a: OnboardingValue | undefined, b: OnboardingValue | undefined) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * One run of the wizard: which cards it shows, where it is, and what it saved.
 *
 * Kept apart from the component so the rules — resume, skip-reverts, branch
 * order, progress — are testable without a DOM.
 *
 * The card list is live. Answering "yes" to pseudonymity adds four cards;
 * choosing a second language adds the learning cards. What stays fixed for the
 * run is the set of cards that were already answered when it opened, so a card
 * answered *during* the run stays in the list and Back can return to it.
 */
export class OnboardingFlow {
  private app: OnboardingAppRecord = readOnboardingApp();
  private account: OnboardingAccountRecord = readOnboardingAccount() ?? emptyOnboardingAccount();
  private readonly includeApp = signal(true);
  private readonly excluded = signal<ReadonlySet<string>>(new Set());
  private history: string[] = [];

  readonly list = computed(() =>
    this.questions.filter(
      (q) =>
        (q.scope !== 'app' || this.includeApp()) && !this.excluded().has(q.id) && q.when(this.ctx),
    ),
  );

  readonly currentId = signal<string>(DONE);
  readonly current = computed(() => this.questions.find((q) => q.id === this.currentId()) ?? null);

  /** The selection on the current card. Already applied, unless it is a suggestion. */
  readonly value = signal<OnboardingValue | undefined>(undefined);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly canGoBack = signal(false);

  readonly position = computed(() => this.list().findIndex((q) => q.id === this.currentId()) + 1);
  readonly total = computed(() => this.list().length);

  /** The setting as it was when this card opened, for Skip. */
  private original: OnboardingValue | undefined;

  constructor(
    private readonly ctx: OnboardingContext,
    private readonly questions: readonly OnboardingQuestion[],
    mode: OnboardingOpenMode,
  ) {
    // Resume: everything not yet asked, and app-wide cards only until they are done.
    this.includeApp.set(!this.app.completed);
    this.excluded.set(new Set([...this.app.answered, ...this.account.answered]));
    if (mode === 'menu' && this.list().length === 0) {
      // Nothing left to resume: the menu entry is a full rerun.
      this.includeApp.set(true);
      this.excluded.set(new Set());
    }
    this.enter(this.list()[0]?.id ?? DONE);
  }

  /** The user picked something: it takes effect now. */
  async select(value: OnboardingValue): Promise<void> {
    const q = this.current();
    if (!q?.apply) return;
    const previous = this.value();
    this.value.set(value);
    this.error.set(null);
    this.saving.set(true);
    try {
      await q.apply(this.ctx, value);
    } catch {
      // Never show a setting the server refused: show what it actually has.
      this.value.set(q.read ? q.read(this.ctx) : previous);
      this.error.set(SERVER_REFUSED);
    } finally {
      this.saving.set(false);
    }
  }

  /** Keep the selection and move on. A suggestion not yet applied is applied now. */
  async next(): Promise<void> {
    const q = this.current();
    if (!q) return;
    const value = this.value();
    if (q.read && q.apply && value !== undefined && !same(value, q.read(this.ctx))) {
      this.saving.set(true);
      try {
        await q.apply(this.ctx, value);
      } catch {
        this.value.set(q.read(this.ctx));
        this.error.set(SERVER_REFUSED);
        return;
      } finally {
        this.saving.set(false);
      }
    }
    this.answer(q);
    this.advance();
  }

  /** Don't decide this now: put back whatever this card changed, and move on. */
  async skip(): Promise<void> {
    const q = this.current();
    if (!q) return;
    const original = this.original;
    if (q.read && q.apply && original !== undefined && !same(q.read(this.ctx), original)) {
      this.saving.set(true);
      try {
        await q.apply(this.ctx, original);
      } catch {
        // The change stays; the card already said the server refused it.
      } finally {
        this.saving.set(false);
      }
    }
    this.answer(q);
    this.advance();
  }

  back(): void {
    const previous = this.history.pop();
    if (previous) this.enter(previous);
  }

  /** An action card's button was pressed: it counts as answered. */
  answerCurrent(): void {
    const q = this.current();
    if (q) this.answer(q);
  }

  /** The reader reached the end (Done, or Plus setup). */
  finish(): void {
    this.account = { ...this.account, finished: true };
    writeOnboardingAccount(this.account);
    if (this.includeApp()) {
      this.app = { ...this.app, completed: true };
      writeOnboardingApp(this.app);
    }
  }

  private answer(q: OnboardingQuestion): void {
    if (q.scope === 'app') {
      if (!this.app.answered.includes(q.id)) {
        this.app = { ...this.app, answered: [...this.app.answered, q.id] };
      }
      // Once every app-wide card in this run is behind us, later accounts skip them.
      const answered = new Set(this.app.answered);
      if (this.list().every((c) => c.scope !== 'app' || answered.has(c.id))) {
        this.app = { ...this.app, completed: true };
      }
      writeOnboardingApp(this.app);
    } else if (!this.account.answered.includes(q.id)) {
      this.account = { ...this.account, answered: [...this.account.answered, q.id] };
      writeOnboardingAccount(this.account);
    }
  }

  private advance(): void {
    const from = this.currentId();
    const at = this.questions.findIndex((q) => q.id === from);
    const nextId = this.list().find((q) => this.questions.indexOf(q) > at)?.id ?? DONE;
    this.history.push(from);
    this.enter(nextId);
    if (nextId === DONE) this.finish();
  }

  private enter(id: string): void {
    this.currentId.set(id);
    this.canGoBack.set(this.history.length > 0);
    this.error.set(null);
    const q = this.current();
    this.original = q?.read?.(this.ctx);
    this.value.set(q?.suggest?.(this.ctx) ?? this.original);
  }
}
