import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AnonymousAccount } from './anonymous-account';

describe('AnonymousAccount', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [AnonymousAccount] });
  });

  it('creates one local identity for the selected home instance', () => {
    const anonymous = TestBed.inject(AnonymousAccount);

    anonymous.activate('https://mastodon.art/');

    expect(anonymous.server()).toBe('https://mastodon.art');
    expect(anonymous.account().display_name).toBe('Anonymous');
    expect(anonymous.account().username).toBe('mastodon.art');
    expect(anonymous.account().id).toBe('anonymous');
  });

  it('retains customized identity fields when its home instance changes', () => {
    const anonymous = TestBed.inject(AnonymousAccount);
    anonymous.activate('https://mastodon.social');
    anonymous.updateAccount({ ...anonymous.account(), display_name: 'Incognito Reader' });

    anonymous.activate('https://hachyderm.io');

    expect(anonymous.server()).toBe('https://hachyderm.io');
    expect(anonymous.account().display_name).toBe('Incognito Reader');
    expect(anonymous.account().username).toBe('hachyderm.io');
  });

  it('recovers from malformed persisted state', () => {
    localStorage.setItem('mockingbird_anonymous_account', '{bad json');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [AnonymousAccount] });

    const anonymous = TestBed.inject(AnonymousAccount);

    expect(anonymous.account().display_name).toBe('Anonymous');
    expect(anonymous.server()).toBe('https://mastodon.social');
  });

  it('validates, escapes, and persists locally editable profile fields', async () => {
    const anonymous = TestBed.inject(AnonymousAccount);
    anonymous.activate('https://mastodon.art');

    const account = await anonymous.updateProfile(
      {
        displayName: '  Demo Demoson  ',
        username: ' @demo ',
        note: '<script>alert(1)</script>\nHello',
        fields: [{ name: '<b>Site</b>', value: 'https://example.com?a=1&b=2' }],
      },
      null,
      null,
    );

    expect(account.display_name).toBe('Demo Demoson');
    expect(account.username).toBe('demo');
    expect(account.note).toContain('&lt;script&gt;');
    expect(account.note).not.toContain('<script>');
    expect(account.fields[0]).toEqual({
      name: '&lt;b&gt;Site&lt;/b&gt;',
      value: 'https://example.com?a=1&amp;b=2',
    });
    expect(account.source?.note).toBe('<script>alert(1)</script>\nHello');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [AnonymousAccount] });
    expect(TestBed.inject(AnonymousAccount).account().display_name).toBe('Demo Demoson');
  });

  it('resets presentation without changing the selected home instance', async () => {
    const anonymous = TestBed.inject(AnonymousAccount);
    anonymous.activate('https://hachyderm.io');
    await anonymous.updateProfile(
      { displayName: 'Reader', username: 'reader', note: 'bio', fields: [] },
      null,
      null,
    );

    anonymous.resetIdentity();

    expect(anonymous.server()).toBe('https://hachyderm.io');
    expect(anonymous.account().display_name).toBe('Anonymous');
    expect(anonymous.account().username).toBe('hachyderm.io');
  });
});
