import { SETUP_STEPS, type SetupContext, type SetupStep } from './setup-steps';
import type { SetupRecord } from './setup-store';

/**
 * A DOM-free run of account setup: which steps show, where Next, Skip and Back
 * go, progress, and resume. The page component only renders what this decides,
 * so the rules are unit-tested here without a browser.
 */
export class SetupFlow {
  constructor(
    private readonly ctx: SetupContext,
    private readonly record: Pick<SetupRecord, 'answered'>,
    private readonly steps: readonly SetupStep[] = SETUP_STEPS,
  ) {}

  /** Steps whose condition holds now, in order. Recomputed as answers change. */
  visible(): SetupStep[] {
    return this.steps.filter((step) => step.when(this.ctx));
  }

  isVisible(id: string): boolean {
    return this.visible().some((step) => step.id === id);
  }

  /** Where `/setup` resumes: the first visible unanswered step, else Done. */
  resumeAt(): string {
    const visible = this.visible();
    return (visible.find((step) => !this.record.answered.includes(step.id)) ?? visible.at(-1))!.id;
  }

  /** The step after `id`, or null after the last. */
  after(id: string): string | null {
    const visible = this.visible();
    const at = visible.findIndex((step) => step.id === id);
    return at >= 0 && at + 1 < visible.length ? visible[at + 1].id : null;
  }

  /** The step before `id`, or null on the first. */
  before(id: string): string | null {
    const visible = this.visible();
    const at = visible.findIndex((step) => step.id === id);
    return at > 0 ? visible[at - 1].id : null;
  }

  /** One-based position and total, for "Step 3 of 9". */
  progress(id: string): { index: number; total: number } {
    const visible = this.visible();
    return { index: visible.findIndex((step) => step.id === id) + 1, total: visible.length };
  }
}

/** `answered` with `id` added once. Next and Skip both count as answered. */
export function withAnswered(answered: readonly string[], id: string): string[] {
  return answered.includes(id) ? [...answered] : [...answered, id];
}
