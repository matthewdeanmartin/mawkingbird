import { computed, inject, Injectable, Injector, signal } from '@angular/core';
import { SupporterStatus } from './supporter-status';
import { DiagnosticLog } from '../../diagnostic-log';

export type PlusBadgeState = 'checking' | 'free' | 'plus' | 'unavailable';

/** Resolve the visible badge without ever calling an unsettled account "Free". */
export function plusBadgeState(
  supporter: boolean,
  checking: boolean,
  unavailable: boolean,
): PlusBadgeState {
  if (supporter) {
    return 'plus';
  }
  if (checking) {
    return 'checking';
  }
  return unavailable ? 'unavailable' : 'free';
}

/**
 * Settle the account tier for the header without eagerly bundling account code.
 *
 * The header exists on nearly every route, but most visitors never use a
 * Mawkingbird account. Keep its dependency lightweight and load the session
 * machinery only when the asynchronous check actually starts. One promise is
 * shared by every caller; the underlying session/token services deduplicate
 * their own network requests too.
 */
@Injectable({ providedIn: 'root' })
export class PlusBadgeEntitlement {
  private injector = inject(Injector);
  private supporter = inject(SupporterStatus);
  private checking = signal(true);
  private unavailable = signal(false);
  private pending: Promise<void> | null = null;
  private log = inject(DiagnosticLog);

  readonly state = computed(() =>
    plusBadgeState(this.supporter.isSupporter(), this.checking(), this.unavailable()),
  );

  /** Check once per app load; failure leaves an honest unavailable state. */
  check(): Promise<void> {
    return (this.pending ??= this.load());
  }

  private async load(): Promise<void> {
    this.log.write('info', 'Mockingbird PlusBadge', 'entitlement:start', {
      cachedSupporter: this.supporter.isSupporter(),
    });
    try {
      const [{ MawkingbirdSession }, { PlusSession }] = await Promise.all([
        import('./mawkingbird-session'),
        import('./plus-session'),
      ]);
      const session = this.injector.get(MawkingbirdSession);
      await session.ensureReady();
      if (!session.user()) {
        this.log.write('info', 'Mockingbird PlusBadge', 'entitlement:account', {
          account: 'anonymous',
        });
        return;
      }
      const token = await this.injector.get(PlusSession).token();
      this.unavailable.set(token === null);
      this.log.write('info', 'Mockingbird PlusBadge', 'entitlement:account', {
        account: 'signed-in',
        tokenAvailable: token !== null,
        supporter: this.supporter.isSupporter(),
      });
    } catch (error) {
      this.unavailable.set(true);
      this.log.write('warn', 'Mockingbird PlusBadge', 'entitlement:error', {
        name: error instanceof Error ? error.name : 'UnknownError',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.checking.set(false);
      this.log.write('info', 'Mockingbird PlusBadge', 'entitlement:settled', {
        state: this.state(),
      });
    }
  }
}
