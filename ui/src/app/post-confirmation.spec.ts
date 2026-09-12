import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientPrefs } from './client-prefs';
import { PostConfirmation } from './post-confirmation';
import { Pseudonymity } from './pseudonymity';

describe('PostConfirmation', () => {
  const ordinaryReminder = signal(false);
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('mastodon_mock_token', 'alice-token');
    ordinaryReminder.set(false);
    TestBed.configureTestingModule({
      providers: [{ provide: ClientPrefs, useValue: { confirmBeforePost: ordinaryReminder } }],
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps ordinary posting silent unless its existing reminder is on', () => {
    const dialog = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const confirmation = TestBed.inject(PostConfirmation);
    expect(confirmation.confirm()).toBe(true);
    expect(dialog).not.toHaveBeenCalled();
    ordinaryReminder.set(true);
    confirmation.confirm();
    expect(dialog).toHaveBeenCalledExactlyOnceWith('Do you really want to post that?');
  });

  it('names the account in a single PA reminder and respects cancellation and opt-out', () => {
    const dialog = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const settings = TestBed.inject(Pseudonymity);
    const confirmation = TestBed.inject(PostConfirmation);
    settings.setEnabled(true);
    ordinaryReminder.set(true);
    expect(confirmation.confirm('@alice@example.social')).toBe(false);
    expect(dialog).toHaveBeenCalledTimes(1);
    expect(dialog.mock.calls[0][0]).toContain('Pseudonymity mode is on for @alice@example.social');
    expect(dialog.mock.calls[0][0]).toContain('personal information');
    settings.setReminder(false);
    expect(confirmation.confirm()).toBe(true);
    expect(dialog).toHaveBeenCalledTimes(1);
    settings.setEnabled(false);
    expect(confirmation.confirm()).toBe(false);
    expect(dialog).toHaveBeenLastCalledWith('Do you really want to post that?');
  });
});
