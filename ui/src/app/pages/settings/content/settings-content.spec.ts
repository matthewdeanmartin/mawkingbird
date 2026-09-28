import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { SettingsContent } from './settings-content';
import { TrustedAccounts } from '../../../trusted-accounts';
import { FollowTrust } from '../../../follow-trust';
import { Auth } from '../../../auth';
import { Api } from '../../../api';
import { Server } from '../../../server';
import { AppDialogs } from '../../../app-dialogs';
import { Account } from '../../../models';

describe('SettingsContent shared choices', () => {
  const confirm = vi.fn();
  beforeEach(() => {
    localStorage.clear();
    confirm.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: FollowTrust, useValue: { isFollowing: () => false } },
        { provide: Auth, useValue: { isAnonymous: false, isBlueskyPrimary: false } },
        { provide: Api, useValue: { preferences: () => of({ 'reading:expand:spoilers': true }) } },
        { provide: Server, useValue: { baseUrl: () => 'https://example.test/path' } },
        { provide: AppDialogs, useValue: { confirm } },
      ],
    });
  });
  afterEach(() => localStorage.clear());
  it('keeps all four radio values and named accounts while trust is temporarily disabled', async () => {
    const trusted = TestBed.inject(TrustedAccounts);
    trusted.trust({
      id: 'one',
      acct: 'person@example.test',
      url: 'https://example.test/@person',
    } as Account);
    trusted.setExpandAllCw(true);
    const f = TestBed.createComponent(SettingsContent);
    await f.whenStable();
    const radios = Array.from(
      (f.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('input[type="radio"]'),
    );
    expect(radios.map((r) => r.value)).toEqual([
      'none',
      'individuals',
      'follows',
      'follows-boosts',
    ]);
    expect(radios[1].checked).toBe(true);
    radios[0].click();
    await f.whenStable();
    expect(trusted.level()).toBe('none');
    expect(trusted.count()).toBe(1);
    const checks = Array.from(
      (f.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    );
    expect(checks.every((c) => c.disabled)).toBe(true);
    expect(checks[0].checked).toBe(true);
    radios[3].click();
    await f.whenStable();
    expect(trusted.level()).toBe('follows-boosts');
    expect(trusted.count()).toBe(1);
    expect(checks.every((c) => !c.disabled)).toBe(true);
    checks[1].click();
    await f.whenStable();
    expect(trusted.showAllSensitiveSetting()).toBe(true);
    for (const input of [...radios, ...checks]) {
      expect(f.nativeElement.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
      expect(input.getAttribute('aria-describedby')).toBeTruthy();
    }
  });
  it('retains the read-only server link and requires confirmation before destructive revocation', async () => {
    const trusted = TestBed.inject(TrustedAccounts);
    trusted.setLevel('follows');
    trusted.setExpandAllCw(true);
    const f = TestBed.createComponent(SettingsContent);
    await f.whenStable();
    const link = (f.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'a[target="_blank"]',
    )!;
    expect(link.href).toBe('https://example.test/settings/preferences/other');
    expect(link.rel).toBe('noopener noreferrer');
    const revoke = Array.from((f.nativeElement as HTMLElement).querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Revoke all trust',
    )!;
    confirm.mockResolvedValueOnce(false);
    revoke.click();
    await f.whenStable();
    expect(trusted.level()).toBe('follows');
    confirm.mockResolvedValueOnce(true);
    revoke.click();
    await f.whenStable();
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(trusted.level()).toBe('none');
    expect(trusted.expandAllCwSetting()).toBe(false);
  });
});
