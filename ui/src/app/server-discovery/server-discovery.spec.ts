import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MastodonServers, ServerSuggestion } from '../mastodon-servers';
import { ServerDiscovery } from './server-discovery';

const SERVERS: ServerSuggestion[] = [
  {
    domain: 'down.example',
    description: 'Unavailable in this test.',
    category: 'general',
    users: 10,
  },
  {
    domain: 'working.example',
    description: 'A working community.',
    category: 'tech',
    users: 2_000,
  },
];

describe('ServerDiscovery', () => {
  const directory = {
    source: signal<'cache' | 'bundled' | 'live'>('bundled'),
    ready: vi.fn().mockResolvedValue(undefined),
    shuffled: vi.fn().mockImplementation(() => [...SERVERS]),
  };

  beforeEach(() => {
    directory.ready.mockClear();
    directory.shuffled.mockClear();
    directory.shuffled.mockImplementation(() => [...SERVERS]);
    TestBed.configureTestingModule({
      imports: [ServerDiscovery],
      providers: [{ provide: MastodonServers, useValue: directory }],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('shows a reachable candidate without switching until the user approves it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.includes('working.example')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ title: 'Working Mastodon' }),
          });
        }
        return Promise.reject(new Error('offline'));
      }),
    );
    const fixture = TestBed.createComponent(ServerDiscovery);
    const selected: string[] = [];
    fixture.componentInstance.selected.subscribe((url) => selected.push(url));
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.btn-outline')!
      .click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain('working.example is available');
    });
    expect(selected).toEqual([]);

    const useButton = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).find((button) => button.textContent?.includes('Use this server'))!;
    useButton.click();

    expect(selected).toEqual(['https://working.example']);
  });

  it('excludes the current server from a search', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const fixture = TestBed.createComponent(ServerDiscovery);
    fixture.componentRef.setInput('currentServer', 'https://current.example');
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement)
      .querySelector<HTMLButtonElement>('.btn-outline')!
      .click();
    await vi.waitFor(() => expect(directory.shuffled).toHaveBeenCalled());

    const excluded = directory.shuffled.mock.calls[0][0] as Set<string>;
    expect(excluded.has('current.example')).toBe(true);
  });

  it('skips degraded servers unless the user explicitly accepts them', async () => {
    directory.shuffled.mockImplementation(() => [
      { domain: 'degraded.example', description: '', category: '', users: 20_000 },
    ]);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ thumbnail: 'https://cdn.example/image.png' }),
        })
        .mockRejectedValueOnce(new Error('cdn blocked'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ thumbnail: 'https://cdn.example/image.png' }),
        })
        .mockRejectedValueOnce(new Error('cdn blocked')),
    );
    const fixture = TestBed.createComponent(ServerDiscovery);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const buttons = (): HTMLButtonElement[] =>
      Array.from(element.querySelectorAll<HTMLButtonElement>('button'));

    buttons()
      .find((button) => button.textContent?.includes('Find another'))!
      .click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(element.textContent).toContain('Couldn’t find');
    });

    const checkbox = element.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    checkbox.checked = true;
    checkbox.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    buttons()
      .find((button) => button.textContent?.includes('Search again'))!
      .click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(element.textContent).toContain('available but degraded');
    });
  });
});
