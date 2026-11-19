import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '../../../platform/api/api';
import { Auth } from '../../../platform/session/auth';
import { Server } from '../../../platform/http/server';
import { ClientPrefs } from '../../../platform/storage/client-prefs';
import { scopeSuffixForMastodonAccount } from '../../../platform/session/account-scope';
import { Pseudonymity } from '../../pseudonymity';
import { readOnboardingAccount, readOnboardingApp } from '../../onboarding/onboarding-store';
import { SetupState } from '../setup-state';
import { armSetup } from '../setup-store';
import { SetupPurpose } from './setup-purpose';
import { SetupProfile } from './setup-profile';
import { SetupLanguages } from './setup-languages';
import { SetupFindable } from './setup-findable';

const SERVER = 'https://mastodon.example';
const ME = {
  id: '42',
  username: 'alice',
  acct: 'alice',
  display_name: 'Alice',
  note: '<p>hi</p>',
  avatar: 'https://mastodon.example/a.png',
  locked: false,
  discoverable: true,
  indexable: true,
  source: { privacy: 'public', language: 'en', note: 'hi', sensitive: false, fields: [] },
};

describe('setup steps', () => {
  let api: {
    verifyCredentials: ReturnType<typeof vi.fn>;
    updateCredentials: ReturnType<typeof vi.fn>;
  };
  let sent: FormData[];

  beforeEach(() => {
    localStorage.clear();
    sent = [];
    api = {
      verifyCredentials: vi.fn(() => of(ME)),
      updateCredentials: vi.fn((form: FormData) => {
        sent.push(form);
        return of(ME);
      }),
    };
    TestBed.configureTestingModule({ providers: [SetupState, { provide: Api, useValue: api }] });
    TestBed.inject(Server).setBaseUrl(SERVER);
    const auth = TestBed.inject(Auth);
    auth.setToken('alice-token');
    auth.setAccount(ME as never);
    armSetup(scopeSuffixForMastodonAccount('42', SERVER), 'signup');
  });

  const commit = async () => TestBed.inject(SetupState).commit!();
  const keys = (form: FormData) => [...form.keys()];

  it('purpose: a pseudonym turns Pseudonymity on and is remembered', async () => {
    const fixture = TestBed.createComponent(SetupPurpose);
    fixture.detectChanges();
    (fixture.componentInstance as unknown as { choice: { set(v: string): void } }).choice.set(
      'pseudonym',
    );
    await commit();
    expect(TestBed.inject(Pseudonymity).enabled()).toBe(true);
    expect(TestBed.inject(SetupState).record().purpose).toBe('pseudonym');
    expect(readOnboardingAccount()?.answered).toContain('pseudonymous');
  });

  it('profile: sends only changed fields, and nothing when nothing changed', async () => {
    const fixture = TestBed.createComponent(SetupProfile);
    fixture.detectChanges();
    await commit();
    expect(sent).toHaveLength(0);

    const input = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    input.value = 'I post about bicycles.';
    input.dispatchEvent(new Event('input'));
    await commit();
    expect(sent).toHaveLength(1);
    expect(keys(sent[0])).toEqual(['note']);
    expect(sent[0].get('note')).toBe('I post about bicycles.');
  });

  it('profile: never offers copying to a pseudonym', () => {
    TestBed.inject(Auth).setToken('other-token');
    TestBed.inject(Auth).setAccount({ ...ME, id: '7', acct: 'main' } as never);
    TestBed.inject(Auth).setToken('alice-token');
    TestBed.inject(SetupState).save({ purpose: 'pseudonym' });
    const fixture = TestBed.createComponent(SetupProfile);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Copy name and bio');
  });

  it('findable: shows each cost, and writes only what changed', async () => {
    const fixture = TestBed.createComponent(SetupFindable);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Expect far fewer followers');
    expect(text).toContain('Most new followers come from here');

    await commit();
    expect(sent).toHaveLength(0);
    expect(readOnboardingAccount()?.answered).toEqual(
      expect.arrayContaining(['pa-locked', 'pa-discoverable', 'visibility']),
    );
  });

  it('findable: a pseudonym starts private, applied only on Next', async () => {
    TestBed.inject(SetupState).save({ purpose: 'pseudonym' });
    const fixture = TestBed.createComponent(SetupFindable);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(sent).toHaveLength(0);
    await commit();
    expect(sent.map((f) => keys(f)[0])).toEqual(['discoverable', 'indexable', 'locked']);
    expect(sent.map((f) => f.get(keys(f)[0]))).toEqual(['false', 'false', 'true']);
  });

  it('findable: a refused write throws so the page keeps the person on the step', async () => {
    api.updateCredentials.mockReturnValue(throwError(() => new Error('422')));
    TestBed.inject(SetupState).save({ purpose: 'pseudonym' });
    const fixture = TestBed.createComponent(SetupFindable);
    fixture.detectChanges();
    await fixture.whenStable();
    await expect(commit()).rejects.toThrow();
  });

  it('languages: saves languages read and the posting language', async () => {
    TestBed.inject(ClientPrefs).setKnownLanguages(['en', 'de']);
    const fixture = TestBed.createComponent(SetupLanguages);
    fixture.detectChanges();
    await fixture.whenStable();
    (fixture.componentInstance as unknown as { posting: { set(v: string): void } }).posting.set(
      'de',
    );
    await commit();
    expect(TestBed.inject(ClientPrefs).knownLanguages()).toEqual(['en', 'de']);
    expect(sent.map((f) => f.get('source[language]'))).toEqual(['de']);
    expect(readOnboardingApp().answered).toContain('languages');
  });
});
