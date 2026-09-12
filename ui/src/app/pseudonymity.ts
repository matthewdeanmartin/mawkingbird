import { Injectable, signal } from '@angular/core';
import { accountScopeSuffix, ANONYMOUS_SCOPE_SUFFIX, scopedKey } from './account-scope';

const STORAGE_BASE = 'mockingbird_pseudonymity';
interface PseudonymityState {
  enabled: boolean;
  reminder: boolean;
  cleanLinks: boolean;
  cleanMedia: boolean;
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
    this.write({
      ...current,
      enabled,
      reminder: enabled && !current.enabled ? true : current.reminder,
    });
  }

  setReminder(reminder: boolean): void {
    this.write({ ...this.read(), reminder });
  }

  cleanLinks(): boolean {
    const state = this.read();
    return state.enabled && state.cleanLinks;
  }
  cleanMedia(): boolean {
    const state = this.read();
    return state.enabled && state.cleanMedia;
  }
  setCleanLinks(cleanLinks: boolean): void {
    this.write({ ...this.read(), cleanLinks });
  }
  setCleanMedia(cleanMedia: boolean): void {
    this.write({ ...this.read(), cleanMedia });
  }

  private read(): PseudonymityState {
    this.revision();
    const scope = accountScopeSuffix();
    if (!scope || scope === ANONYMOUS_SCOPE_SUFFIX)
      return { enabled: false, reminder: true, cleanLinks: true, cleanMedia: true };
    try {
      const value = JSON.parse(localStorage.getItem(scopedKey(STORAGE_BASE)) ?? 'null');
      return {
        enabled: value?.enabled === true,
        reminder: value?.reminder !== false,
        cleanLinks: value?.cleanLinks !== false,
        cleanMedia: value?.cleanMedia !== false,
      };
    } catch {
      return { enabled: false, reminder: true, cleanLinks: true, cleanMedia: true };
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
