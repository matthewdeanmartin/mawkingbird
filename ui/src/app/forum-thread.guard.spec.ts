import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRouteSnapshot,
  convertToParamMap,
  provideRouter,
  Router,
  RouterStateSnapshot,
  UrlTree,
} from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppMode, AppModeService } from './app-mode';
import { forumThreadGuard } from './forum-thread.guard';

describe('forumThreadGuard', () => {
  let mode: ReturnType<typeof signal<AppMode>>;

  beforeEach(() => {
    mode = signal<AppMode>('forum');
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AppModeService, useValue: { mode } }],
    });
  });

  function run(id: string | null, queryParams: Record<string, string> = {}) {
    const route = {
      paramMap: convertToParamMap(id ? { id } : {}),
      queryParams,
    } as unknown as ActivatedRouteSnapshot;
    return TestBed.runInInjectionContext(() => forumThreadGuard(route, {} as RouterStateSnapshot));
  }

  it('keeps a post opened from Forum in Forum, query and all', () => {
    const result = run('117510436531883862', { reader: 'thread' });
    expect(result).toBeInstanceOf(UrlTree);
    expect(TestBed.inject(Router).serializeUrl(result as UrlTree)).toBe(
      '/forum/d/117510436531883862?reader=thread',
    );
  });

  it('leaves posts alone from every other mode', () => {
    for (const other of ['mastodon', 'rss', 'video', 'radio'] as const) {
      mode.set(other);
      expect(run('1')).toBe(true);
    }
  });

  it('lets a malformed link through to the thread page’s own handling', () => {
    expect(run(null)).toBe(true);
  });
});
