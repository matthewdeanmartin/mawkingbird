import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scopeSuffixForDid, scopeSuffixForMastodonAccount } from '../../../account-scope';
import { Auth } from '../../../auth';
import { SettingsAccounts } from './settings-accounts';
import { seedBskyIdentity, seedSessions } from '../../../testing/seed-storage';

/** Exposes the component's protected members for white-box testing. */
interface Internals {
  accounts(): {
    key: string;
    token: string | null;
    kind: 'mastodon' | 'bluesky' | 'anonymous';
    did?: string;
    active: boolean;
    keyCount: number;
  }[];
  canModify(row: { active: boolean; kind: string }): boolean;
  askDeleteData(row: unknown): void;
  askDeleteDataAndLogout(row: unknown): void;
  confirm(): void;
  cancel(): void;
  pending(): unknown;
  notice(): string;
}

function internals(fixture: ComponentFixture<SettingsAccounts>): Internals {
  return fixture.componentInstance as unknown as Internals;
}

const TOKEN_A = 'token-a';
const TOKEN_B = 'token-b';

describe('SettingsAccounts', () => {
  function setUp(): ComponentFixture<SettingsAccounts> {
    const fixture = TestBed.createComponent(SettingsAccounts);
    fixture.detectChanges();
    return fixture;
  }

  /** Two saved logins, A active, each owning one scoped key. */
  function seedTwoAccounts(): void {
    seedSessions([
      { token: TOKEN_A, server: '', account: { id: '1', username: 'ann', acct: 'ann' } },
      { token: TOKEN_B, server: '', account: { id: '2', username: 'bob', acct: 'bob' } },
    ] as never);
    localStorage.setItem('mastodon_mock_token', TOKEN_A);
    localStorage.setItem('mastodon_mock_account_mode', 'mastodon');
    localStorage.setItem(
      `mockingbird_rss_feeds${scopeSuffixForMastodonAccount('1', location.origin)}`,
      '["a"]',
    );
    localStorage.setItem(
      `mockingbird_rss_feeds${scopeSuffixForMastodonAccount('2', location.origin)}`,
      '["b"]',
    );
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  // Auth is a root singleton whose `mode` signal is seeded from localStorage at
  // construction. Clearing storage alone would leave an already-built Auth still
  // reporting "signed in", so reset the injector too — otherwise later suites
  // (Anonymous capabilities, StatusCard) inherit this file's logged-in state.
  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('lists every saved login plus the permanent Anonymous account', () => {
    seedTwoAccounts();
    const fixture = setUp();
    const rows = internals(fixture).accounts();

    // Rows are keyed by the session's local id, never by its bearer token.
    expect(rows.map((r) => r.key)).toEqual(['mastodon:s0', 'mastodon:s1', 'anonymous']);
    expect(fixture.nativeElement.querySelector('.spage-head p')?.textContent).toContain(
      'Every credential saved',
    );
    expect(fixture.nativeElement.querySelector('.page-head p')).toBeNull();
  });

  it('marks the signed-in account and reports each account’s data size', () => {
    seedTwoAccounts();
    const rows = internals(setUp()).accounts();

    expect(rows.find((r) => r.token === TOKEN_A)!.active).toBe(true);
    expect(rows.find((r) => r.token === TOKEN_B)!.active).toBe(false);
    expect(rows.find((r) => r.token === TOKEN_B)!.keyCount).toBe(1);
  });

  it('lists and removes an inactive Bluesky alt with its DID-scoped data', () => {
    seedSessions([{ token: TOKEN_A, server: '', account: null }]);
    localStorage.setItem('mastodon_mock_token', TOKEN_A);
    localStorage.setItem('mastodon_mock_account_mode', 'mastodon');
    seedBskyIdentity({ did: 'did:plc:alt', handle: 'alt.bsky.social' });
    const suffix = scopeSuffixForDid('did:plc:alt');
    localStorage.setItem(`mockingbird_rss_feeds${suffix}`, '["alt"]');
    const fixture = setUp();
    const alt = internals(fixture)
      .accounts()
      .find((row) => row.did === 'did:plc:alt')!;

    expect(alt.keyCount).toBe(1);
    internals(fixture).askDeleteDataAndLogout(alt);
    internals(fixture).confirm();

    expect(localStorage.getItem(`mockingbird_rss_feeds${suffix}`)).toBeNull();
    expect(TestBed.inject(Auth).blueskyAccounts()).toEqual([]);
    expect(TestBed.inject(Auth).token()).toBe(TOKEN_A);
  });

  it('blocks destructive actions on the active account while another exists', () => {
    seedTwoAccounts();
    const rows = internals(setUp()).accounts();

    expect(internals(setUp()).canModify(rows.find((r) => r.token === TOKEN_A)!)).toBe(false);
    expect(internals(setUp()).canModify(rows.find((r) => r.token === TOKEN_B)!)).toBe(true);
  });

  it('allows acting on the active account when it is the only saved login', () => {
    seedSessions([{ token: TOKEN_A, server: '', account: null }]);
    localStorage.setItem('mastodon_mock_token', TOKEN_A);
    localStorage.setItem('mastodon_mock_account_mode', 'mastodon');

    const fixture = setUp();
    const active = internals(fixture)
      .accounts()
      .find((r) => r.token === TOKEN_A)!;

    expect(internals(fixture).canModify(active)).toBe(true);
  });

  it('deletes another account’s data without touching the active one or its login', () => {
    seedTwoAccounts();
    const fixture = setUp();
    const other = internals(fixture)
      .accounts()
      .find((r) => r.token === TOKEN_B)!;

    internals(fixture).askDeleteData(other);
    internals(fixture).confirm();

    expect(
      localStorage.getItem(
        `mockingbird_rss_feeds${scopeSuffixForMastodonAccount('2', location.origin)}`,
      ),
    ).toBeNull();
    expect(
      localStorage.getItem(
        `mockingbird_rss_feeds${scopeSuffixForMastodonAccount('1', location.origin)}`,
      ),
    ).toBe('["a"]');
    // "Delete data" keeps the saved login — that's what separates it from log out.
    expect(TestBed.inject(Auth).sessions()).toHaveLength(2);
    expect(internals(fixture).notice()).toContain('Deleted');
  });

  it('delete-and-log-out also removes the saved session', () => {
    seedTwoAccounts();
    const fixture = setUp();
    const other = internals(fixture)
      .accounts()
      .find((r) => r.token === TOKEN_B)!;

    internals(fixture).askDeleteDataAndLogout(other);
    internals(fixture).confirm();

    expect(
      localStorage.getItem(
        `mockingbird_rss_feeds${scopeSuffixForMastodonAccount('2', location.origin)}`,
      ),
    ).toBeNull();
    expect(
      TestBed.inject(Auth)
        .sessions()
        .map((s) => s.token),
    ).toEqual([TOKEN_A]);
  });

  it('cancelling deletes nothing', () => {
    seedTwoAccounts();
    const fixture = setUp();
    const other = internals(fixture)
      .accounts()
      .find((r) => r.token === TOKEN_B)!;

    internals(fixture).askDeleteData(other);
    internals(fixture).cancel();

    expect(internals(fixture).pending()).toBeNull();
    expect(
      localStorage.getItem(
        `mockingbird_rss_feeds${scopeSuffixForMastodonAccount('2', location.origin)}`,
      ),
    ).toBe('["b"]');
  });

  it('refuses to act on a blocked row even if confirm is reached', () => {
    seedTwoAccounts();
    const fixture = setUp();
    const active = internals(fixture)
      .accounts()
      .find((r) => r.token === TOKEN_A)!;

    internals(fixture).askDeleteData(active);
    internals(fixture).confirm();

    expect(
      localStorage.getItem(
        `mockingbird_rss_feeds${scopeSuffixForMastodonAccount('1', location.origin)}`,
      ),
    ).toBe('["a"]');
  });
});
