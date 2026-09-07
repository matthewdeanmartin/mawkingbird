import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CorsProxySettings } from '../cors-proxy/cors-proxy-settings';
import { GitHubSession } from '../github/github-session';
import { HugoSettings } from '../hugo/hugo-settings';
import { MataroaSettings } from '../mataroa/mataroa-settings';
import { OpenRouterSession } from '../openrouter/openrouter-session';
import { GistSettings } from '../paste/gist-settings';
import { RaindropSession } from '../raindrop/raindrop-session';
import { ShortenerSettings } from '../shortener/shortener-settings';
import { TwitterSettings } from '../twitter/twitter-settings';
import { VaultAdoption } from './vault-adoption';

describe('VaultAdoption', () => {
  const order: string[] = [];
  const outcome = (name: string, kind: 'stored' | 'restored' | 'merged' | 'skipped') =>
    vi.fn(async () => {
      order.push(name);
      return { kind };
    });

  beforeEach(() => {
    order.length = 0;
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: OpenRouterSession,
          useValue: { reconcileVault: outcome('OpenRouter', 'restored') },
        },
        {
          provide: CorsProxySettings,
          useValue: { reconcileVault: outcome('CORS proxy', 'skipped') },
        },
        {
          provide: ShortenerSettings,
          useValue: { reconcileVault: outcome('Link shorteners', 'merged') },
        },
        { provide: RaindropSession, useValue: { reconcileVault: outcome('Raindrop', 'skipped') } },
        { provide: TwitterSettings, useValue: { reconcileVault: outcome('Twitter', 'stored') } },
        { provide: MataroaSettings, useValue: { reconcileVault: outcome('Mataroa', 'stored') } },
        {
          provide: HugoSettings,
          useValue: {
            reconcileVault: vi.fn(async () => {
              order.push('Hugo');
              throw new Error('storage unavailable');
            }),
          },
        },
        {
          provide: GitHubSession,
          useValue: {
            reconcileVault: vi.fn(async () => {
              order.push('GitHub');
              return { kind: 'conflict' as const, message: 'different keys' };
            }),
          },
        },
        { provide: GistSettings, useValue: { reconcileVault: outcome('GitHub Gist', 'skipped') } },
      ],
    });
  });

  it('imports each connector sequentially and reports stored and failed entries', async () => {
    const result = await TestBed.inject(VaultAdoption).reconcileExisting();

    expect(order).toEqual([
      'OpenRouter',
      'CORS proxy',
      'Link shorteners',
      'Raindrop',
      'Twitter',
      'Mataroa',
      'Hugo',
      'GitHub',
      'GitHub Gist',
    ]);
    expect(result.restored).toEqual(['OpenRouter']);
    expect(result.stored).toEqual(['Twitter', 'Mataroa']);
    expect(result.merged).toEqual(['Link shorteners']);
    expect(result.conflicts).toEqual([{ connector: 'GitHub', message: 'different keys' }]);
    expect(result.failed).toEqual([{ connector: 'Hugo', message: 'storage unavailable' }]);
  });
});
