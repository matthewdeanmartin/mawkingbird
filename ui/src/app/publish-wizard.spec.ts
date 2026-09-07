import { describe, expect, it } from 'vitest';
import {
  ALL_STEPS_ON,
  WizardSteps,
  activeSteps,
  firstStep,
  forwardLabel,
  isLastStep,
  nextStep,
  previousStep,
  stepPosition,
} from './publish-wizard';

function steps(overrides: Partial<WizardSteps>): WizardSteps {
  return { ...ALL_STEPS_ON, ...overrides };
}

const NONE: WizardSteps = { targets: false, preview: false, quality: false, when: false };

describe('activeSteps', () => {
  it('keeps the fixed order', () => {
    expect(activeSteps(ALL_STEPS_ON)).toEqual(['preview', 'quality', 'targets', 'when']);
  });

  it('omits switched-off steps without reordering the rest', () => {
    expect(activeSteps(steps({ preview: false }))).toEqual(['quality', 'targets', 'when']);
  });

  it('is empty when every step is off', () => {
    expect(activeSteps(NONE)).toEqual([]);
  });
});

describe('firstStep', () => {
  it('opens on the first enabled step', () => {
    expect(firstStep(ALL_STEPS_ON)).toBe('preview');
    expect(firstStep(steps({ preview: false }))).toBe('quality');
    expect(firstStep(steps({ preview: false, quality: false, targets: false }))).toBe('when');
  });

  it('is null when everything is off, so the caller publishes instead', () => {
    // Someone who turned the whole wizard off must not get an empty dialog.
    expect(firstStep(NONE)).toBeNull();
  });
});

describe('nextStep', () => {
  it('walks the enabled steps in order', () => {
    expect(nextStep('preview', ALL_STEPS_ON)).toBe('quality');
    expect(nextStep('quality', ALL_STEPS_ON)).toBe('targets');
    expect(nextStep('targets', ALL_STEPS_ON)).toBe('when');
  });

  it('skips a disabled step', () => {
    expect(nextStep('quality', steps({ targets: false }))).toBe('when');
  });

  it('skips several disabled steps at once', () => {
    expect(nextStep('preview', steps({ quality: false, when: false }))).toBe('targets');
  });

  it('is null at the end, which is what triggers publishing', () => {
    expect(nextStep('when', ALL_STEPS_ON)).toBeNull();
    expect(nextStep('targets', steps({ when: false }))).toBeNull();
  });
});

describe('previousStep', () => {
  it('walks backwards over enabled steps', () => {
    expect(previousStep('when', ALL_STEPS_ON)).toBe('targets');
    expect(previousStep('quality', ALL_STEPS_ON)).toBe('preview');
  });

  it('skips a disabled step going back', () => {
    // Back from When must not land on a hidden Targets step.
    expect(previousStep('when', steps({ targets: false }))).toBe('quality');
  });

  it('is null on the first step', () => {
    expect(previousStep('preview', ALL_STEPS_ON)).toBeNull();
    expect(previousStep('quality', steps({ preview: false }))).toBeNull();
  });

  it('round-trips: forward then back returns where it started', () => {
    const enabled = steps({ quality: false });
    const forward = nextStep('preview', enabled)!;
    expect(previousStep(forward, enabled)).toBe('preview');
  });
});

describe('isLastStep and forwardLabel', () => {
  it('the final enabled step publishes', () => {
    expect(isLastStep('when', ALL_STEPS_ON)).toBe(true);
    expect(forwardLabel('when', ALL_STEPS_ON)).toBe('wizard.forward.publish');
  });

  it('moves the Publish button when the last step is switched off', () => {
    const enabled = steps({ when: false });
    expect(isLastStep('targets', enabled)).toBe(true);
    expect(forwardLabel('targets', enabled)).toBe('wizard.forward.publish');
  });

  it('an earlier step continues rather than publishing', () => {
    expect(isLastStep('preview', ALL_STEPS_ON)).toBe(false);
    expect(forwardLabel('preview', ALL_STEPS_ON)).toBe('wizard.forward.continue');
  });

  it('a lone enabled step both opens the wizard and publishes from it', () => {
    const enabled = { ...NONE, quality: true };
    expect(firstStep(enabled)).toBe('quality');
    expect(isLastStep('quality', enabled)).toBe(true);
    expect(previousStep('quality', enabled)).toBeNull();
  });
});

describe('stepPosition', () => {
  it('numbers the enabled steps from one', () => {
    expect(stepPosition('preview', ALL_STEPS_ON)).toBe(1);
    expect(stepPosition('when', ALL_STEPS_ON)).toBe(4);
  });

  it('renumbers when a step is off', () => {
    expect(stepPosition('when', steps({ quality: false }))).toBe(3);
  });

  it('is zero for a step that is not shown', () => {
    expect(stepPosition('preview', steps({ preview: false }))).toBe(0);
  });
});
