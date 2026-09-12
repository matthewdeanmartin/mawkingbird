import { Injectable, signal } from '@angular/core';
import { accountScopeSuffix, ANONYMOUS_SCOPE_SUFFIX, scopedKey } from './account-scope';

const STORAGE_BASE = 'mockingbird_pseudonymity';
interface PseudonymityState {
  enabled: boolean;
  reminder: boolean;
}

/** Local to a social identity. Never included in the global settings sync document. */
@Injectable({ providedIn: 'root' })
export class Pseudonymity {
  private revision = signal(0);

  enabled(): boolean {
    return this.read().enabled;
  }

  reminder(): boolean {
    return this.read().reminder;
  }

  setEnabled(enabled: boolean): void {
    const current = this.read();
    this.write({ enabled, reminder: enabled && !current.enabled ? true : current.reminder });
  }

  setReminder(reminder: boolean): void {
    this.write({ ...this.read(), reminder });
  }

  private read(): PseudonymityState {
    this.revision();
    const scope = accountScopeSuffix();
    if (!scope || scope === ANONYMOUS_SCOPE_SUFFIX) return { enabled: false, reminder: true };
    try {
      const value = JSON.parse(localStorage.getItem(scopedKey(STORAGE_BASE)) ?? 'null');
      return { enabled: value?.enabled === true, reminder: value?.reminder !== false };
    } catch {
      return { enabled: false, reminder: true };
    }
  }

  private write(state: PseudonymityState): void {
    const scope = accountScopeSuffix();
    if (!scope || scope === ANONYMOUS_SCOPE_SUFFIX) return;
    // Persist first: the UI must not claim protection was saved after a quota failure.
    localStorage.setItem(scopedKey(STORAGE_BASE), JSON.stringify(state));
    this.revision.update((value) => value + 1);
  }
}
