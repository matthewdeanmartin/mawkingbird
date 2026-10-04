import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../app.routes';
import { connectionHelpServer, isPrivateNetworkServer } from '../../host-url';
import { translocoTesting } from '../../i18n/i18n.testing';
import { ConnectionHelp } from './connection-help';

describe('public connection help', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('opens before login, explains all platforms, and never contacts the household server', async () => {
    localStorage.clear();
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    TestBed.configureTestingModule({
      imports: [translocoTesting()],
      providers: [provideRouter(routes)],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(
      '/connection-help?server=https%3A%2F%2Fmastomini.local',
      ConnectionHelp,
    );
    const el = harness.routeNativeElement!;
    expect(el.querySelector('h1')?.textContent).toBe('Connecting to your server');
    expect(el.querySelectorAll('mb-disclosure')).toHaveLength(6);
    expect(el.querySelector('a[href="http://mastomini.local/trust"]')).toBeTruthy();
    expect(el.querySelector('a[href="https://mastomini.local"]')).toBeTruthy();
    expect(el.textContent).toContain('SHA-256');
    expect(el.textContent).toContain('full trust');
    expect(fetch).not.toHaveBeenCalled();
    expect(localStorage.getItem('mastodon_mock_server')).toBeNull();
  });
  it('accepts only web origins without embedded credentials for recovery links', () => {
    expect(connectionHelpServer('mastomini.local')).toBe('https://mastomini.local');
    expect(connectionHelpServer('https://safe.example/path?secret=ignored')).toBe(
      'https://safe.example',
    );
    expect(connectionHelpServer('https://user:secret@private.example')).toBeNull();
    expect(connectionHelpServer('javascript:alert(1)')).toBeNull();
    expect(connectionHelpServer(null)).toBeNull();
  });
  it('keeps private addresses direct and distinguishes them from public hosts', () => {
    for (const server of [
      'https://mastomini.local',
      'https://192.168.1.42',
      'https://10.0.0.2',
      'https://172.16.0.2',
      'https://[fd00::1]',
      'http://localhost:8000',
    ])
      expect(isPrivateNetworkServer(server)).toBe(true);
    for (const server of [
      'https://mastodon.social',
      'https://172.32.0.2',
      'https://192.168.1.42.example',
      'https://local.example',
    ])
      expect(isPrivateNetworkServer(server)).toBe(false);
  });
});
