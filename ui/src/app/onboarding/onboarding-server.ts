import { signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../api';
import { ClientPrefs } from '../client-prefs';
import { OnboardingServer, ServerField, ServerSettings } from './onboarding-questions';

/** Credentials form keys, as Settings → Privacy writes them. */
const FORM_KEYS: Record<ServerField, string> = {
  locked: 'locked',
  discoverable: 'discoverable',
  privacy: 'source[privacy]',
  language: 'source[language]',
};

/**
 * The Mastodon account settings the wizard can change.
 *
 * Loads with one `verify_credentials` when the card opens for a Mastodon
 * account, and nothing otherwise. Writes one field per request, exactly as
 * the Privacy page does, so a stale value from another card never rides along.
 * A failed load leaves {@link state} null, which hides every server card.
 */
export class MastodonOnboardingServer implements OnboardingServer {
  private readonly settings = signal<ServerSettings | null>(null);
  readonly state = this.settings.asReadonly();

  constructor(
    private readonly api: Api,
    private readonly prefs: ClientPrefs,
  ) {}

  load(): void {
    this.api.verifyCredentials().subscribe({
      next: (acc) =>
        this.settings.set({
          locked: acc.locked ?? false,
          discoverable: acc.discoverable ?? false,
          privacy: acc.source?.privacy ?? 'public',
          language: acc.source?.language ?? '',
        }),
      error: () => this.settings.set(null),
    });
  }

  async write(field: ServerField, value: boolean | string): Promise<void> {
    const current = this.settings();
    if (!current) throw new Error('Server settings are not loaded.');
    const form = new FormData();
    form.append(FORM_KEYS[field], String(value).trim());
    // Optimistic: the card shows the new value at once, and reverts on failure.
    this.settings.set({ ...current, [field]: value });
    try {
      await firstValueFrom(this.api.updateCredentials(form));
    } catch (err) {
      this.settings.set(current);
      throw err;
    }
    if (field === 'privacy') this.prefs.setDefaultVisibility(String(value));
    if (field === 'language' && value) this.prefs.addKnownLanguage(String(value));
  }
}

/** For accounts with no Mastodon server behind them. */
export const NO_SERVER: OnboardingServer = {
  state: signal<ServerSettings | null>(null).asReadonly(),
  write: () => Promise.reject(new Error('No Mastodon server.')),
};
