import {
  HttpErrorResponse,
  HttpInterceptorFn,
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { firstValueFrom, Observable, timeout, TimeoutError } from 'rxjs';
import { afterAll, beforeEach, describe, expect, it, TestContext } from 'vitest';
import { Api } from '../src/app/platform/api/api';
import { authInterceptor } from '../src/app/platform/http/auth.interceptor';
import { Server } from '../src/app/platform/http/server';
import { serverInterceptor } from '../src/app/platform/http/server.interceptor';

const origin = 'https://mastodon.social';
const stateFile = path.join(
  process.env['MAWKINGBIRD_ARTIFACTS'] || path.join(homedir(), '.cache', 'mawkingbird'),
  'live-api',
  'mastodon.social.version',
);

// Check the actual outgoing request after the production interceptors have run.
const publicReadOnly: HttpInterceptorFn = (req, next) => {
  expect(new URL(req.url).origin).toBe(origin);
  expect(req.method).toBe('GET');
  expect(req.headers.has('Authorization')).toBe(false);
  return next(req.clone({ credentials: 'omit', redirect: 'error' }));
};

describe.sequential('live Mastodon public API via Mawkingbird', () => {
  let api: Api;
  let stop = 'Instance metadata has not been verified';
  let version: string;
  let passed = 0;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(
          withFetch(),
          withInterceptors([serverInterceptor, authInterceptor, publicReadOnly]),
        ),
      ],
    });
    TestBed.inject(Server).setBaseUrl(origin);
    api = TestBed.inject(Api);
  });

  async function read<T>(request: Observable<T>, ctx: TestContext): Promise<T> {
    try {
      return await firstValueFrom(request.pipe(timeout(8000)));
    } catch (error) {
      if (
        error instanceof TimeoutError ||
        (error instanceof HttpErrorResponse &&
          ([0, 408, 429].includes(error.status) || error.status >= 500))
      ) {
        const reason = error instanceof TimeoutError ? 'timeout' : 'HTTP ' + error.status;
        stop = 'Inconclusive: ' + reason + '. Stopping live requests for this run.';
        process.stderr.write(stop + '\n');
        ctx.skip(stop);
      }
      throw error;
    }
  }

  it('reads the instance version and the limits used by the composer', async (ctx) => {
    const info = await read(api.instanceInfo(), ctx);
    expect(info.domain).toBe('mastodon.social');
    expect(info.title).toEqual(expect.any(String));
    expect(info.configuration?.statuses?.max_characters).toBeGreaterThan(0);
    const release = /^(\d+\.\d+\.\d+)/.exec(info.version);
    expect(release, 'base Mastodon release').not.toBeNull();
    const level = 'api_versions' in info ? info.api_versions : undefined;
    expect(level).toMatchObject({ mastodon: expect.any(Number) });
    version = release![1] + '/api-' + (level as { mastodon: number }).mastodon;

    let previous = '';
    try {
      previous = (await readFile(stateFile, 'utf8')).trim();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    stop = previous === version ? 'Already verified ' + version : '';
    process.stdout.write((stop || 'Checking public contracts for ' + version) + '\n');
  });

  const checks = [
    {
      name: 'reads the published instance rules',
      run: async (ctx: TestContext) => {
        const rules = await read(api.instanceRules(), ctx);
        expect(Array.isArray(rules)).toBe(true);
        for (const rule of rules) {
          expect(rule).toMatchObject({ id: expect.any(String), text: expect.any(String) });
        }
      },
    },
    {
      name: 'reads custom emoji for the picker',
      run: async (ctx: TestContext) => {
        const emojis = await read(api.customEmojis(), ctx);
        expect(Array.isArray(emojis)).toBe(true);
        for (const emoji of emojis) {
          expect(emoji).toMatchObject({
            shortcode: expect.any(String),
            url: expect.stringMatching(/^https:\/\//),
            static_url: expect.stringMatching(/^https:\/\//),
            visible_in_picker: expect.any(Boolean),
          });
        }
      },
    },
    {
      name: 'reads statuses and author identities for Explore',
      run: async (ctx: TestContext) => {
        const statuses = await read(api.trendingStatuses(), ctx);
        expect(Array.isArray(statuses)).toBe(true);
        for (const status of statuses) {
          expect(status).toMatchObject({
            id: expect.any(String),
            content: expect.any(String),
            created_at: expect.any(String),
            account: { id: expect.any(String), acct: expect.any(String) },
            media_attachments: expect.any(Array),
          });
        }
      },
    },
  ];

  for (const check of checks) {
    it(check.name, async (ctx) => {
      if (stop) ctx.skip(stop);
      await check.run(ctx);
      passed++;
    });
  }

  afterAll(async () => {
    if (passed !== checks.length) return;
    await mkdir(path.dirname(stateFile), { recursive: true });
    const pending = stateFile + '.' + process.pid;
    await writeFile(pending, version + '\n', 'utf8');
    await rename(pending, stateFile);
  });
});
