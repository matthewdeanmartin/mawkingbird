/**
 * Settings sync as one switch.
 *
 * The test that matters most is the first one: there must be no way to reach a
 * state where something reports sync as on while `ProfileSync` is not running.
 * That divergence was the reported bug — the Plus page showed every feature
 * enabled while the Config page said "Sync is off on this browser" — and it was
 * possible because two independent switches each answered the same question.
 */

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLUS_FEATURES } from './plus-features';
import { ProfileSync } from './profile-sync';
import { SettingsSyncToggle } from './settings-sync-toggle';
import type { SyncState } from './profile-sync-state';

/** The parts of `ProfileSync` the toggle touches, with the real shapes. */
type SyncDouble = Pick<ProfileSync, 'syncing' | 'state' | 'enable' | 'disable' | 'resume'>;

function toggleOver(state: SyncState) {
  const double = {
    syncing: signal(state === 'on'),
    state: signal(state),
    enable: vi.fn().mockResolvedValue({ kind: 'saved' }),
    disable: vi.fn(),
    resume: vi.fn().mockResolvedValue({ kind: 'applied', changes: [] }),
  } satisfies SyncDouble;

  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [{ provide: ProfileSync, useValue: double }],
  });
  return { toggle: TestBed.inject(SettingsSyncToggle), sync: double };
}

beforeEach(() => localStorage.clear());

describe('there is only one switch', () => {
  it('is on exactly when ProfileSync is syncing', () => {
    expect(toggleOver('on').toggle.on()).toBe(true);
    for (const state of ['unasked', 'off', 'paused', 'off-but-remote-exists'] as SyncState[]) {
      expect(toggleOver(state).toggle.on()).toBe(false);
    }
  });

  it('is not a stored Plus feature', () => {
    // The regression guard for the reported bug. A stored `settingsSync`
    // defaulted to true the moment someone subscribed, while ProfileSync
    // independently sat at `unasked` — so the Plus page and the Config page
    // each read their own switch and each reported something different.
    expect(PLUS_FEATURES).not.toContain('settingsSync');
  });
});

describe('what the states mean', () => {
  it.each([
    ['on', 'on'],
    ['unasked', 'never-asked'],
    ['paused', 'paused'],
    ['off', 'declined'],
    ['off-but-remote-exists', 'available-elsewhere'],
  ])('reports %s as %s', (state, detail) => {
    expect(toggleOver(state as SyncState).toggle.detail()).toBe(detail);
  });
});

describe('turning it on', () => {
  it('pushes from a browser that has never synced', async () => {
    // A first-run browser is *defining* the baseline every other machine
    // inherits, so it uploads.
    const { toggle, sync } = toggleOver('unasked');
    await toggle.set(true);
    expect(sync.enable).toHaveBeenCalled();
    expect(sync.resume).not.toHaveBeenCalled();
  });

  it.each(['paused', 'off', 'off-but-remote-exists'] as SyncState[])(
    'pulls when rejoining from %s',
    async (state) => {
      // The important half. A rejoining browser must not push, or it overwrites
      // a profile built elsewhere with whatever happens to be in this one.
      const { toggle, sync } = toggleOver(state);
      await toggle.set(true);
      expect(sync.resume).toHaveBeenCalled();
      expect(sync.enable).not.toHaveBeenCalled();
    },
  );

  it('does nothing when already on', async () => {
    const { toggle, sync } = toggleOver('on');
    await toggle.set(true);
    expect(sync.enable).not.toHaveBeenCalled();
    expect(sync.resume).not.toHaveBeenCalled();
  });
});

describe('turning it off', () => {
  it('stops syncing without destroying anything', async () => {
    // `disable()` pauses and keeps the stored document: "stop changing my
    // browser" is not "destroy my profile".
    const { toggle, sync } = toggleOver('on');
    await toggle.set(false);
    expect(sync.disable).toHaveBeenCalled();
  });

  it('reports a refusal instead of failing silently', async () => {
    // The reported bug: a stale free-tier token made the service answer 402,
    // `set` swallowed the outcome, and the toggle flipped back with nothing
    // shown or said. The message has to reach the caller for the UI to render.
    const { toggle, sync } = toggleOver('unasked');
    sync.enable.mockResolvedValue({ kind: 'read-only', message: 'Profile storage is Plus.' });
    await expect(toggle.set(true)).resolves.toBe('Profile storage is Plus.');
  });

  it('is safe to turn off when already off', async () => {
    const { toggle, sync } = toggleOver('paused');
    // null is the "nothing went wrong" answer: `set` now reports a failure
    // message so a refused toggle cannot fail silently.
    await expect(toggle.set(false)).resolves.toBeNull();
    expect(sync.enable).not.toHaveBeenCalled();
  });
});
