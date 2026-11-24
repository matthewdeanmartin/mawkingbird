import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { of, Subject } from 'rxjs';
import { expect, it, vi } from 'vitest';
import en from '../../../../public/i18n/en.json';
import { PLATFORM_NETWORK } from '../../platform/http/platform-http';
import { NativeProxyStatus } from '../../platform/http/connector-types';
import { SettingsNetwork } from './settings-network';

it('updates native proxy labels after English arrives and when the language changes', async () => {
  const events = new Subject<{ type: string }>();
  const words: Record<string, string> = {};
  const status: NativeProxyStatus = {
    settings: { mode: 'direct', host: '', port: 0, has_credentials: false },
    in_use: null,
    problem: null,
    windows_available: true,
  };
  const readStatus = vi.fn().mockResolvedValue(status);
  TestBed.configureTestingModule({
    providers: [
      { provide: PLATFORM_NETWORK, useValue: { status: readStatus } },
      {
        provide: TranslocoService,
        useValue: {
          events$: events,
          load: () => of({}),
          translate: (key: string) => words[key] ?? key,
        },
      },
    ],
  });
  const page = TestBed.runInInjectionContext(() => new SettingsNetwork());
  await page.ngOnInit();
  expect(page['modes']()[0].label).toBe('settings.network.mode.direct');
  expect(page['stateLine']()).toBe('settings.network.direct');

  for (const [key, value] of Object.entries(en.settings)) words[`settings.${key}`] = value;
  events.next({ type: 'translationLoadSuccess' });
  expect(page['modes']().map(({ label, hint }) => [label, hint])).toEqual([
    ['Direct (no proxy)', en.settings['network.mode.direct.hint']],
    ['Use Windows proxy', en.settings['network.mode.windows.hint']],
    ['Manual HTTP proxy', en.settings['network.mode.http.hint']],
    ['Manual SOCKS5 proxy', en.settings['network.mode.socks5.hint']],
  ]);
  expect(page['stateLine']()).toBe('Connecting directly.');

  words['settings.network.mode.direct'] = 'Direkt (ohne Proxy)';
  words['settings.network.direct'] = 'Direkte Verbindung.';
  events.next({ type: 'langChanged' });
  expect(page['modes']()[0].label).toBe('Direkt (ohne Proxy)');
  expect(page['stateLine']()).toBe('Direkte Verbindung.');
  expect(readStatus).toHaveBeenCalledTimes(1);
});
