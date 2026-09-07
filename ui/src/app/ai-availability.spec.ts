import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AiAvailability } from './ai-availability';
import { ClientPrefs } from './client-prefs';
import { FeatureFlags } from './feature-flags';

describe('AiAvailability', () => {
  let ai: AiAvailability;
  let prefs: ClientPrefs;
  let flags: FeatureFlags;

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    ai = TestBed.inject(AiAvailability);
    prefs = TestBed.inject(ClientPrefs);
    flags = TestBed.inject(FeatureFlags);
  });

  it('is on by default', () => {
    expect(ai.enabled()).toBe(true);
    expect(ai.disabledReason()).toBeNull();
  });

  it('is off when the user turns AI off', () => {
    prefs.setAiMode('off');

    expect(ai.enabled()).toBe(false);
    expect(ai.disabledReason()).toContain('Appearance');
  });

  it('is off when the operator flag is off, even with the user switch on', () => {
    // The two switches answer different questions — taste and outage — so
    // either one has to be able to hide the surface on its own.
    flags.setState('connector-openrouter', 'off');

    expect(prefs.aiMode()).toBe('on');
    expect(ai.enabled()).toBe(false);
    expect(ai.disabledReason()).toContain('feature flag');
  });

  it('blames the user preference first when both are off', () => {
    // It is the one they can act on from where they are standing.
    prefs.setAiMode('off');
    flags.setState('connector-openrouter', 'off');

    expect(ai.disabledReason()).toContain('Appearance');
  });

  it('comes back on when the preference is restored', () => {
    prefs.setAiMode('off');
    prefs.setAiMode('on');

    expect(ai.enabled()).toBe(true);
  });
});
