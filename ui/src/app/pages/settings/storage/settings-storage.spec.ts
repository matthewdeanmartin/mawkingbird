import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scopeSuffixForToken } from '../../../account-scope';
import { SettingsStorage } from './settings-storage';

describe('SettingsStorage', () => {
  let fixture: ComponentFixture<SettingsStorage>;

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mastodon_mock_account_mode', 'anonymous');
    localStorage.setItem('mockingbird_anonymous_follows', '[]');
    localStorage.setItem('mockingbird_rss_feeds_anonymous', '[]');
    localStorage.setItem('mockingbird_rss_feeds_other', '[]');
    localStorage.setItem(
      'mastodon_mock_sessions',
      JSON.stringify([
        {
          id: 'other',
          server: 'https://example.social',
          account: {
            id: '2',
            username: 'other',
            acct: 'other@example.social',
            display_name: 'Other',
          },
        },
      ]),
    );
    localStorage.setItem('mastodon_mock_session_tokens', JSON.stringify({ other: 'token-other' }));
    localStorage.setItem(`mockingbird_rss_feeds${scopeSuffixForToken('token-other')}`, '["saved"]');
    fixture = TestBed.createComponent(SettingsStorage);
    fixture.detectChanges();
  });

  it('inspects another saved account without switching the active account', async () => {
    const select = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>(
      '[aria-label="Storage account"]',
    )!;
    select.value = 'mastodon:other';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain(`mockingbird_rss_feeds${scopeSuffixForToken('token-other')}`);
    expect(text).not.toContain('mockingbird_anonymous_follows');
    expect(localStorage.getItem('mastodon_mock_account_mode')).toBe('anonymous');
    expect(localStorage.getItem('mastodon_mock_token')).toBeNull();
  });

  it('shows only storage belonging to the active account', () => {
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('mockingbird_anonymous_follows');
    expect(text).toContain('mockingbird_rss_feeds_anonymous');
    expect(text).not.toContain('mockingbird_rss_feeds_other');
    expect(text).not.toContain('mastodon_mock_sessions');
  });

  it('deletes an individual account key', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('[aria-label="Delete mockingbird_anonymous_follows"]')!
      .click();
    expect(localStorage.getItem('mockingbird_anonymous_follows')).toBeNull();
    expect(localStorage.getItem('mastodon_mock_sessions')).toContain('other');
  });
});
