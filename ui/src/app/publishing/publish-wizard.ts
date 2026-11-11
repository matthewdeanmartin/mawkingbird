/**
 * The publish wizard's step machine.
 *
 * Pure and component-free, because the awkward part of this feature is not the
 * dialog — it is what "Back" means when the step behind you is switched off.
 * Getting that wrong strands someone in a loop or skips the step they wanted,
 * and neither is visible from a screenshot.
 */
export type WizardStep = 'targets' | 'preview' | 'quality' | 'when';

/** Fixed order. The wizard never reorders steps; it only omits them. */
export const WIZARD_STEPS: readonly WizardStep[] = ['preview', 'quality', 'targets', 'when'];

/** Which steps the user has switched on. */
export type WizardSteps = Record<WizardStep, boolean>;

export const ALL_STEPS_ON: WizardSteps = {
  targets: true,
  preview: true,
  quality: true,
  when: true,
};

/**
 * The steps that will actually be shown, in order.
 *
 * An empty result is meaningful: it means every step is off, and the publish
 * button should publish rather than open an empty dialog.
 */
export function activeSteps(enabled: WizardSteps): WizardStep[] {
  return WIZARD_STEPS.filter((step) => enabled[step]);
}

/**
 * The step after `current`, or null when `current` is the last one.
 *
 * Skipped steps are skipped in *both* directions — see {@link previousStep}.
 * Advancing past the end is what triggers publishing.
 */
export function nextStep(current: WizardStep, enabled: WizardSteps): WizardStep | null {
  const steps = activeSteps(enabled);
  const at = steps.indexOf(current);
  return at >= 0 && at + 1 < steps.length ? steps[at + 1] : null;
}

/**
 * The step before `current`, or null when `current` is the first one.
 *
 * With a step off, Back skips it rather than rendering an empty dialog.
 */
export function previousStep(current: WizardStep, enabled: WizardSteps): WizardStep | null {
  const steps = activeSteps(enabled);
  const at = steps.indexOf(current);
  return at > 0 ? steps[at - 1] : null;
}

/** The step the wizard opens on, or null when it should not open at all. */
export function firstStep(enabled: WizardSteps): WizardStep | null {
  return activeSteps(enabled)[0] ?? null;
}

/** Whether `step` is the last one, i.e. its forward button publishes. */
export function isLastStep(step: WizardStep, enabled: WizardSteps): boolean {
  return nextStep(step, enabled) === null;
}

/** Position for the "Step 2 of 3" line. 1-based; 0 when the step is not shown. */
export function stepPosition(step: WizardStep, enabled: WizardSteps): number {
  return activeSteps(enabled).indexOf(step) + 1;
}

// i18n wizard.step.targets: Where should this be published?
// i18n wizard.step.preview: How it will look
// i18n wizard.step.quality: Before you publish
// i18n wizard.step.when: Now, or later?
export function stepTitleKey(step: WizardStep): string {
  switch (step) {
    case 'targets':
      return 'wizard.step.targets';
    case 'preview':
      return 'wizard.step.preview';
    case 'quality':
      return 'wizard.step.quality';
    case 'when':
      return 'wizard.step.when';
  }
}

// i18n wizard.forward.publish: Publish
// i18n wizard.forward.continue: Continue
/** Translation key for the button that leaves this step forwards. */
export function forwardLabel(step: WizardStep, enabled: WizardSteps): string {
  return isLastStep(step, enabled) ? 'wizard.forward.publish' : 'wizard.forward.continue';
}
