import { computed, inject, Injectable, signal } from '@angular/core';
import {
  DEFAULT_MYMEMORY_HARD_LIMIT,
  DEFAULT_MYMEMORY_SOFT_LIMIT,
  MYMEMORY_EMAIL_DAILY_CHARS,
  TranslationUsage,
} from '../translation-usage';

export const MYMEMORY_KEY = 'mockingbird_connector_mymemory';
export const APERTIUM_KEY = 'mockingbird_connector_apertium';

interface MyMemoryState {
  enabled: boolean;
  /** Optional: MyMemory raises the free quota from 5K to 50K characters a day. */
  email: string;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as Partial<T>) } : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown, isDefault: boolean): void {
  try {
    if (isDefault) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* Honoured for this session. */
  }
}

/** A loose check: MyMemory only uses it as a contact and quota key. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/**
 * The two free translation services, both **opt-in**: each sends the post's text
 * to a third party, so neither runs until switched on in Settings → Connections.
 * Unscoped, like OpenRouter: a connector belongs to the person, not the account.
 */
@Injectable({ providedIn: 'root' })
export class TranslationConnectors {
  private usage = inject(TranslationUsage);
  private mymemory = signal<MyMemoryState>(
    readJson<MyMemoryState>(MYMEMORY_KEY, { enabled: false, email: '' }),
  );
  private apertium = signal(readJson(APERTIUM_KEY, { enabled: false }));

  readonly myMemoryEnabled = computed(() => this.mymemory().enabled);
  readonly myMemoryEmail = computed(() => this.mymemory().email);
  readonly apertiumEnabled = computed(() => this.apertium().enabled);

  setMyMemoryEnabled(enabled: boolean): void {
    this.saveMyMemory({ ...this.mymemory(), enabled });
  }

  /**
   * Save (or clear) the email. The daily budget follows the tier it unlocks, unless
   * the reader set their own limits — a custom limit is never overwritten.
   */
  setMyMemoryEmail(email: string): void {
    const clean = email.trim();
    if (clean && !looksLikeEmail(clean)) throw new Error('That does not look like an email.');
    const hadEmail = !!this.mymemory().email;
    this.saveMyMemory({ ...this.mymemory(), email: clean });
    const hard = this.usage.hardLimit('mymemory');
    const tierDefault = hadEmail ? MYMEMORY_EMAIL_DAILY_CHARS : DEFAULT_MYMEMORY_HARD_LIMIT;
    if (hard !== tierDefault) return;
    if (clean) {
      this.usage.setLimits(
        'mymemory',
        MYMEMORY_EMAIL_DAILY_CHARS * 0.8,
        MYMEMORY_EMAIL_DAILY_CHARS,
      );
    } else {
      this.usage.setLimits('mymemory', DEFAULT_MYMEMORY_SOFT_LIMIT, DEFAULT_MYMEMORY_HARD_LIMIT);
    }
  }

  setApertiumEnabled(enabled: boolean): void {
    this.apertium.set({ enabled });
    writeJson(APERTIUM_KEY, { enabled }, !enabled);
  }

  private saveMyMemory(state: MyMemoryState): void {
    this.mymemory.set(state);
    writeJson(MYMEMORY_KEY, state, !state.enabled && !state.email);
  }
}
