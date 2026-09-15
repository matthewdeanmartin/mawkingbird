import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionPastes } from './connection-pastes';
import { PasteSettings } from '../../../../providers/paste/paste-settings';
import { PasteProviderRegistry } from '../../../../providers/paste/paste-provider-registry';
import { PasteFeedSubscriptions } from '../../../../providers/paste/paste-feed-subscriptions';
import { PasteFeedFetch } from '../../../../providers/paste/paste-feed-fetch';

describe('Paste service settings', () => {
  const rentry = {
    id: 'rentry',
    label: 'Rentry',
    expiries: [{ value: 'never', label: 'Does not expire' }],
  };
  const gist = {
    id: 'gist',
    label: 'GitHub Gist',
    expiries: [{ value: 'never', label: 'Does not expire' }],
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: PasteProviderRegistry,
          useValue: {
            all: [rentry, gist],
            feeds: [],
            default: rentry,
            available: signal([rentry]),
            get: (id: string) => (id === 'gist' ? gist : rentry),
          },
        },
        { provide: PasteFeedSubscriptions, useValue: {} },
        { provide: PasteFeedFetch, useValue: { proxyLabel: () => null } },
      ],
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('keeps unavailable providers visible and directs setup to the existing credential page', () => {
    const fixture = TestBed.createComponent(ConnectionPastes);
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll(
      '.provider',
    ) as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBe(2);
    buttons[1].click();
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector('a[href="/settings/connections/gist"]'),
    ).not.toBeNull();
    expect(fixture.nativeElement.querySelector('.setup button').disabled).toBe(true);
    fixture.componentInstance.activate('gist');
    expect(TestBed.inject(PasteSettings).selected()).toBe('rentry');
  });

  it('switches the default without touching existing paste history or edit keys', () => {
    const history = '[{"providerId":"rentry","content":"saved draft"}]';
    localStorage.setItem('mockingbird_pastes', history);
    localStorage.setItem('mockingbird_paste_edit_keys', '{"id":"secret"}');
    const settings = TestBed.inject(PasteSettings);
    expect(settings.select('tinyurl')).toBe(true);
    expect(settings.selected()).toBe('tinyurl');
    expect(new PasteSettings().selected()).toBe('tinyurl');
    expect(localStorage.getItem('mockingbird_pastes')).toBe(history);
    expect(localStorage.getItem('mockingbird_paste_edit_keys')).toBe('{"id":"secret"}');
  });

  it('rejects unknown providers and preserves the preference if storage is full', () => {
    const settings = TestBed.inject(PasteSettings);
    expect(settings.select('retired-provider')).toBe(false);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(settings.select('tinyurl')).toBe(false);
    expect(settings.selected()).toBe('rentry');
  });

  it('falls back safely when a retired preference is loaded', () => {
    localStorage.setItem('mockingbird_paste_service', 'retired-provider');
    expect(TestBed.inject(PasteSettings).selected()).toBe('rentry');
  });
});
