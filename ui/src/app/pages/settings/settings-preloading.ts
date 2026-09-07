import { inject, Injectable, signal } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { catchError, defer, EMPTY, Observable, of, throwError } from 'rxjs';
import { UpdateRecovery } from '../../update-recovery';

/**
 * Preloads settings component code after the settings area has been opened once.
 *
 * Route preloading only resolves `loadComponent`; it does not instantiate the
 * component, so lifecycle hooks and their API requests still wait for activation.
 */
@Injectable({ providedIn: 'root' })
export class SettingsPreloading implements PreloadingStrategy {
  private readonly enabled = signal(false);
  private readonly recovery = inject(UpdateRecovery);

  enable(): void {
    this.enabled.set(true);
  }

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    if (!this.enabled() || route.data?.['preloadSettings'] !== true) {
      return of(null);
    }

    return defer(load).pipe(
      catchError((error: unknown) => {
        if (this.recovery.recover(error)) {
          return EMPTY;
        }
        return throwError(() => error);
      }),
    );
  }
}
