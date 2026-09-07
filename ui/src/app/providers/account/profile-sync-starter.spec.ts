import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfileSyncStarter } from './profile-sync-starter';
import { ProfileSync } from './profile-sync';
import { PROFILE_SYNC_KEY } from './profile-sync-state';
import { MawkingbirdSession } from './mawkingbird-session';
import { PROFILE_ORIGIN } from './profile-client';

/**
 * The starter exists to keep the account machinery out of the initial bundle,
 * so what matters here is the *other* half of that bargain: it must stay silent
 * and cheap for everyone who never signs in, and it must never be able to break
 * application start.
 */

class FakeMawkingbirdSession {
  token = vi.fn().mockResolvedValue('mawkingbird-token');
  /** Watched by `ProfileSync` so its record follows the signed-in account. */
  user = signal<{ auth: string; tier: string } | null>(null);
}

describe('ProfileSyncStarter', () => {
  let starter: ProfileSyncStarter;
  let sync: ProfileSync;

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ readOnly: false, quota: { used: 0, limit: 1 }, conflicts: 0 }),
          {
            status: 200,
          },
        ),
      ),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: MawkingbirdSession, useValue: new FakeMawkingbirdSession() },
        { provide: PROFILE_ORIGIN, useValue: 'https://profile-test.mawkingbird.com' },
      ],
    });
    starter = TestBed.inject(ProfileSyncStarter);
    sync = TestBed.inject(ProfileSync);
  });

  it('does nothing on noteLocalChange before start has run', () => {
    // The property that makes this safe to call from ClientPrefs.persist(),
    // which fires on every preference change including the first at startup.
    const noted = vi.spyOn(sync, 'noteLocalChange');
    starter.noteLocalChange();
    expect(noted).not.toHaveBeenCalled();
  });

  it('stays silent after start when sync is off', async () => {
    localStorage.setItem(PROFILE_SYNC_KEY, JSON.stringify({ state: 'off' }));
    sync.resetForTest({ state: 'off' });

    await starter.start();
    const noted = vi.spyOn(sync, 'noteLocalChange');
    starter.noteLocalChange();

    expect(noted).not.toHaveBeenCalled();
  });

  it('never throws when starting fails', async () => {
    // Called from a constructor. A rejection here would be an unhandled promise
    // and could take out application start for an optional feature.
    vi.spyOn(sync, 'start').mockRejectedValue(new Error('offline'));
    await expect(starter.start()).resolves.toBeUndefined();
  });

  it('never throws when a focus recheck fails', async () => {
    vi.spyOn(sync, 'recheckOnFocus').mockRejectedValue(new Error('offline'));
    await expect(starter.recheckOnFocus()).resolves.toBeUndefined();
  });
});
