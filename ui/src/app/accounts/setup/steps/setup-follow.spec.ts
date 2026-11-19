import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { STARTER_KITS } from '../../../discovery/starter-collection';
import { Api } from '../../../platform/api/api';
import { Auth } from '../../../platform/session/auth';
import { Server } from '../../../platform/http/server';
import { ClientPrefs } from '../../../platform/storage/client-prefs';
import { scopeSuffixForMastodonAccount } from '../../../platform/session/account-scope';
import { ImportFollows } from '../../import-follows';
import { SetupState } from '../setup-state';
import { armSetup } from '../setup-store';
import { interestsFor, SetupFollow } from './setup-follow';
import { SetupMovers } from './setup-movers';

const SERVER = 'https://mastodon.example';
const ME = { id: '42', username: 'alice', acct: 'alice', following_count: 0 };
const SUGGESTION = {
  sources: ['featured'],
  account: { id: '9', acct: 'bob', username: 'bob', display_name: 'Bob', avatar: '' },
};

describe('setup movers and follow', () => {
  let start: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        SetupState,
        {
          provide: Api,
          useValue: {
            followSuggestions: vi.fn(() => of([SUGGESTION])),
            verifyCredentials: vi.fn(),
          },
        },
      ],
    });
    TestBed.inject(Server).setBaseUrl(SERVER);
    const auth = TestBed.inject(Auth);
    auth.setToken('alice-token');
    auth.setAccount(ME as never);
    armSetup(scopeSuffixForMastodonAccount('42', SERVER), 'signup', 'twitter');
    start = vi.spyOn(TestBed.inject(ImportFollows), 'start').mockResolvedValue();
  });

  it('movers: a sign-up from Unbird starts on Twitter and saves on Next', async () => {
    const state = TestBed.inject(SetupState);
    TestBed.createComponent(SetupMovers).detectChanges();
    await state.commit!();
    expect(state.record().movers).toBe('twitter');
    expect(state.flow().isVisible('twitter')).toBe(true);
  });

  it('offers interests in the languages someone reads, biggest first, else English', () => {
    const german = interestsFor(['de'], 'en');
    const germanKits = STARTER_KITS.filter((kit) => kit.lang === 'de');
    expect(german.map((i) => i.id).sort()).toEqual(germanKits.map((k) => k.slug).sort());
    for (let i = 1; i < german.length; i++) {
      expect(german[i - 1].people.length).toBeGreaterThanOrEqual(german[i].people.length);
    }
    const fallback = interestsFor(['xx'], 'en');
    expect(fallback.length).toBe(STARTER_KITS.filter((kit) => kit.lang === 'en').length);
  });

  it('follow: server suggestions lead, a chosen interest lists people, and Follow queues them', () => {
    TestBed.inject(ClientPrefs).setKnownLanguages(['en']);
    const fixture = TestBed.createComponent(SetupFollow);
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as {
      interests(): { id: string }[];
      toggleInterest(id: string, on: boolean): void;
      togglePerson(handle: string, on: boolean): void;
      toFollow(): { handle: string }[];
      follow(): void;
    };
    expect(page.interests()[0].id).toBe('server');

    page.toggleInterest('server', true);
    expect(page.toFollow().map((p) => p.handle)).toEqual(['bob']);
    page.togglePerson('bob', false);
    expect(page.toFollow()).toEqual([]);
    page.togglePerson('bob', true);

    page.follow();
    expect(TestBed.inject(ImportFollows).rows()).toEqual([{ handle: 'bob', status: 'pending' }]);
    expect(start).toHaveBeenCalledOnce();
    expect(page.toFollow()).toEqual([]);
  });

  it('follow: never offers the account itself', () => {
    const fixture = TestBed.createComponent(SetupFollow);
    fixture.detectChanges();
    const page = fixture.componentInstance as unknown as {
      toggleInterest(id: string, on: boolean): void;
      people(): { handle: string }[];
    };
    TestBed.inject(Auth).setAccount({ ...ME, acct: 'bob' } as never);
    page.toggleInterest('server', true);
    expect(page.people()).toEqual([]);
  });
});
