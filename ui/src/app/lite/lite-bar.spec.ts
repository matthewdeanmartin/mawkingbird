import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MediaPolicy } from '../platform/network/media-policy';
import { OUTBOX_KEY } from '../platform/offline/outbox-summary';
import { scopeSuffixForToken } from '../platform/session/account-scope';
import { Auth } from '../platform/session/auth';
import { LiteBar } from './lite-bar';
import { LITE_PREFS_DEFAULTS, LITE_PREFS_KEY, LitePrefs, parseLitePrefs } from './lite-prefs';
import { LiteShell } from './lite-shell';

describe('Lite preferences', () => {
  it('start from the agreed defaults', () => {
    expect(parseLitePrefs(null)).toEqual({
      pictures: 'tap',
      avatars: true,
      previews: false,
      refresh: 'stale',
      textSize: 'm',
      width: 'normal',
      highContrast: false,
    });
  });

  it('keep valid stored choices and drop anything unknown', () => {
    const parsed = parseLitePrefs(
      JSON.stringify({ pictures: 'on', avatars: false, refresh: 'sometimes', textSize: 'xl' }),
    );
    expect(parsed.pictures).toBe('on');
    expect(parsed.avatars).toBe(false);
    expect(parsed.refresh).toBe(LITE_PREFS_DEFAULTS.refresh);
    expect(parsed.textSize).toBe('xl');
    expect(parseLitePrefs('not json')).toEqual(LITE_PREFS_DEFAULTS);
  });
});

describe('Lite bar and shell', () => {
  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [LiteBar, LiteShell],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    await TestBed.compileComponents();
    TestBed.inject(Auth).setToken('lite-bar');
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('remembers a choice made in the bar', () => {
    const f = TestBed.createComponent(LiteBar);
    f.detectChanges();
    const select = (f.nativeElement as HTMLElement).querySelector('select') as HTMLSelectElement;
    select.value = 'off';
    select.dispatchEvent(new Event('change'));
    expect(TestBed.inject(LitePrefs).value().pictures).toBe('off');
    expect(JSON.parse(localStorage.getItem(LITE_PREFS_KEY)!).pictures).toBe('off');
  });

  it('applies its choices to post cards only while Lite is open', () => {
    const policy = TestBed.inject(MediaPolicy);
    const f = TestBed.createComponent(LiteShell);
    f.detectChanges();
    expect(policy.override()).toEqual({ pictures: 'tap', avatars: true, previews: false });
    TestBed.inject(LitePrefs).set('avatars', false);
    f.detectChanges();
    expect(policy.override()?.avatars).toBe(false);
    f.destroy();
    expect(policy.override()).toBeNull();
  });

  it('applies reading choices as local styling', () => {
    TestBed.inject(LitePrefs).set('textSize', 'xl');
    TestBed.inject(LitePrefs).set('highContrast', true);
    const f = TestBed.createComponent(LiteShell);
    f.detectChanges();
    const shell = (f.nativeElement as HTMLElement).querySelector('.lite-shell')!;
    expect(shell.getAttribute('data-text')).toBe('xl');
    expect(shell.getAttribute('data-contrast')).toBe('high');
  });

  it('shows the Outbox in the nav only while something is waiting', () => {
    const f = TestBed.createComponent(LiteShell);
    f.detectChanges();
    const outboxLink = () =>
      [...(f.nativeElement as HTMLElement).querySelectorAll('nav a')].find((a) =>
        a.textContent!.includes('Outbox'),
      );
    expect(outboxLink()).toBeUndefined();
    localStorage.setItem(
      OUTBOX_KEY,
      JSON.stringify([
        {
          id: 'q1',
          scope: scopeSuffixForToken('lite-bar'),
          parts: ['hi'],
          options: {},
          posted: [],
          createdAt: Date.now(),
          state: 'waiting',
        },
      ]),
    );
    window.dispatchEvent(new StorageEvent('storage', { key: OUTBOX_KEY }));
    f.detectChanges();
    expect(outboxLink()?.textContent).toContain('(1)');
  });
});
