import { TestBed } from '@angular/core/testing';
import { Route } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UpdateRecovery } from '../../update-recovery';
import { SettingsPreloading } from './settings-preloading';

describe('SettingsPreloading', () => {
  const markedRoute: Route = { path: 'blue', data: { preloadSettings: true } };
  let strategy: SettingsPreloading;
  let recover: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    recover = vi.fn(() => false);
    TestBed.configureTestingModule({
      providers: [{ provide: UpdateRecovery, useValue: { recover } }],
    });
    strategy = TestBed.inject(SettingsPreloading);
  });

  it('does not load settings bundles before the settings shell enables preloading', () => {
    const load = vi.fn<() => Observable<unknown>>(() => of('loaded'));

    strategy.preload(markedRoute, load).subscribe();

    expect(load).not.toHaveBeenCalled();
  });

  it('loads marked settings bundles after preloading is enabled', () => {
    const load = vi.fn<() => Observable<unknown>>(() => of('loaded'));
    strategy.enable();

    strategy.preload(markedRoute, load).subscribe();

    expect(load).toHaveBeenCalledOnce();
  });

  it('does not load unrelated lazy routes', () => {
    const load = vi.fn<() => Observable<unknown>>(() => of('loaded'));
    strategy.enable();

    strategy.preload({ path: 'home' }, load).subscribe();

    expect(load).not.toHaveBeenCalled();
  });

  it('hands chunk preload failures to update recovery', () => {
    const chunkError = new TypeError(
      'Loading module from “chunk.js” was blocked because of a disallowed MIME type (“text/html”).',
    );
    const load = vi.fn<() => Observable<unknown>>(() => throwError(() => chunkError));
    recover.mockReturnValue(true);
    strategy.enable();

    strategy.preload(markedRoute, load).subscribe();

    expect(recover).toHaveBeenCalledWith(chunkError);
  });

  it('does not swallow ordinary preload failures', () => {
    const ordinaryError = new Error('boom');
    const error = vi.fn();
    const load = vi.fn<() => Observable<unknown>>(() => throwError(() => ordinaryError));
    strategy.enable();

    strategy.preload(markedRoute, load).subscribe({ error });

    expect(recover).toHaveBeenCalledWith(ordinaryError);
    expect(error).toHaveBeenCalledWith(ordinaryError);
  });
});
