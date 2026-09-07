import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeDiagnostics } from './home-diagnostics';

describe('HomeDiagnostics', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('writes filterable structured Home messages', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    TestBed.inject(HomeDiagnostics).info('load:start', {
      mode: 'mastodon',
      tokenPresent: true,
    });

    expect(info).toHaveBeenCalledWith('[Mockingbird Home] load:start', {
      mode: 'mastodon',
      tokenPresent: true,
    });
  });

  it('does not log HTTP response bodies or request headers', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const error = new HttpErrorResponse({
      status: 401,
      statusText: 'Unauthorized',
      url: 'https://social.example/api/v1/timelines/home',
      error: { access_token: 'must-not-appear', privatePost: 'must-not-appear' },
    });

    TestBed.inject(HomeDiagnostics).error('mastodon:page-error', error);

    expect(JSON.stringify(logged.mock.calls)).not.toContain('must-not-appear');
    expect(logged.mock.calls[0][1]).toMatchObject({
      failure: {
        kind: 'http',
        status: 401,
        url: 'https://social.example/api/v1/timelines/home',
      },
    });
  });
});
