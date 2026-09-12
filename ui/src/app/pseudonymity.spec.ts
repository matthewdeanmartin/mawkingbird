import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scopedKey } from './account-scope';
import { Pseudonymity } from './pseudonymity';
import { portableKeys } from './portable-config';
import { classifyStorageKey } from './storage-registry';
import {
  saveBlueskyIdentity,
  setActiveBlueskyIdentity,
} from './providers/bluesky/bluesky-identity-store';

describe('Pseudonymity', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mastodon_mock_token', 'alice-token');
    TestBed.configureTestingModule({});
  });

  it('enables an account-local reminder without changing global preferences', () => {
    localStorage.setItem('mockingbird_client_prefs', '{"confirmBeforePost":false}');
    const settings = TestBed.inject(Pseudonymity);
    expect(settings.enabled()).toBe(false);
    settings.setEnabled(true);
    expect(settings.reminder()).toBe(true);
    expect(localStorage.getItem('mockingbird_client_prefs')).toBe('{"confirmBeforePost":false}');
    settings.setReminder(false);
    expect(settings.enabled()).toBe(true);
    expect(settings.reminder()).toBe(false);
    TestBed.resetTestingModule();
    expect(TestBed.inject(Pseudonymity).reminder()).toBe(false);
  });

  it('isolates accounts even when the same service survives an account switch', () => {
    const settings = TestBed.inject(Pseudonymity);
    settings.setEnabled(true);
    settings.setReminder(false);
    localStorage.setItem('mastodon_mock_token', 'bob-token');
    expect(settings.enabled()).toBe(false);
    settings.setEnabled(true);
    expect(settings.reminder()).toBe(true);
    localStorage.setItem('mastodon_mock_token', 'alice-token');
    expect(settings.reminder()).toBe(false);
    settings.setEnabled(false);
    settings.setEnabled(true);
    expect(settings.reminder()).toBe(true);
  });

  it('does not turn the signed-out Anonymous account into a pseudonymous login', () => {
    const settings = TestBed.inject(Pseudonymity);
    localStorage.setItem('mastodon_mock_account_mode', 'anonymous');
    settings.setEnabled(true);
    expect(settings.enabled()).toBe(false);
    expect(localStorage.getItem(scopedKey('mockingbird_pseudonymity'))).toBeNull();
  });

  it('keeps Bluesky identities separate from Mastodon and from each other', () => {
    const settings = TestBed.inject(Pseudonymity);
    settings.setEnabled(true);
    localStorage.setItem('mastodon_mock_account_mode', 'bluesky');
    for (const did of ['did:plc:alice', 'did:plc:bob']) {
      saveBlueskyIdentity(
        { service: 'https://bsky.social', did, handle: 'reader.bsky.social' },
        { accessJwt: 'a', refreshJwt: 'r', connectedAt: Date.now() },
      );
      setActiveBlueskyIdentity(did);
      expect(settings.enabled()).toBe(false);
      settings.setEnabled(true);
    }
    settings.setReminder(false);
    setActiveBlueskyIdentity('did:plc:alice');
    expect(settings.enabled()).toBe(true);
    expect(settings.reminder()).toBe(true);
  });

  it('classifies the flag as private and excludes it from both sync/export profiles', () => {
    TestBed.inject(Pseudonymity).setEnabled(true);
    expect(classifyStorageKey(scopedKey('mockingbird_pseudonymity'))?.sensitivity).toBe('private');
    expect(portableKeys('standard')).not.toContain('mockingbird_pseudonymity');
    expect(portableKeys('private')).not.toContain('mockingbird_pseudonymity');
    expect(classifyStorageKey(scopedKey('mockingbird_client_lists'))?.sensitivity).toBe('private');
  });

  it('does not claim a failed setting write succeeded', () => {
    const settings = TestBed.inject(Pseudonymity);
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('Full', 'QuotaExceededError');
    });
    expect(() => settings.setEnabled(true)).toThrow();
    expect(settings.enabled()).toBe(false);
    write.mockRestore();
  });
});
