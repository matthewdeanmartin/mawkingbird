import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../../auth';
import { MastodonServers } from '../../../mastodon-servers';
import { AnonymousAccount } from '../../../providers/anonymous/anonymous-account';
import { AnonymousPreferences } from '../../../providers/anonymous/anonymous-preferences';
import { SettingsServer } from './settings-server';

describe('SettingsServer', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MastodonServers,
          useValue: {
            servers: signal([]),
            source: signal('bundled'),
            ensureLoaded: vi.fn().mockResolvedValue(undefined),
            ready: vi.fn().mockResolvedValue(undefined),
            shuffled: vi.fn().mockReturnValue([]),
            search: vi.fn().mockReturnValue([]),
          },
        },
      ],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ title: 'Mastodon' }) }),
    );
  });

  it('changes only the anonymous browsing server and keeps the local identity', () => {
    const auth = TestBed.inject(Auth);
    auth.enterAnonymous('https://old.example');
    const anonymous = TestBed.inject(AnonymousAccount);
    const accountBefore = anonymous.account();
    const fixture = TestBed.createComponent(SettingsServer);
    fixture.detectChanges();

    (fixture.componentInstance as unknown as { useServer(url: string): void }).useServer(
      'https://new.example',
    );

    expect(anonymous.server()).toBe('https://new.example');
    expect(anonymous.account().id).toBe(accountBefore.id);
    expect(auth.isAnonymous).toBe(true);

    const details = fixture.nativeElement.querySelector(
      '.anonymous-browsing',
    ) as HTMLDetailsElement;
    expect(details.textContent).toContain('Anonymous browsing');
    (
      fixture.componentInstance as unknown as {
        setMaximumAge(days: number): void;
      }
    ).setMaximumAge(90);
    expect(TestBed.inject(AnonymousPreferences).followedPostMaxAgeDays()).toBe(90);
  });
});
