import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { Api } from '../../platform/api/api';
import { Auth } from '../../platform/session/auth';
import { ClientPrefs } from '../../platform/storage/client-prefs';
import { MastodonOnboardingServer } from '../onboarding/onboarding-server';
import {
  emptyOnboardingAccount,
  readOnboardingAccount,
  readOnboardingApp,
  writeOnboardingAccount,
  writeOnboardingApp,
} from '../onboarding/onboarding-store';
import { SetupFlow } from './setup-flow';
import { readSetup, writeSetup, type SetupRecord } from './setup-store';

/**
 * One setup run, shared by the page and the step on screen. Provided by the
 * page component, so it lives exactly as long as the person is in setup.
 *
 * Steps apply nothing while the person is choosing. Each step registers a
 * {@link commit} that Next runs; Skip never runs it, so a skipped step leaves
 * every setting as it was. A commit that throws keeps the person on the step.
 */
@Injectable()
export class SetupState {
  private readonly auth = inject(Auth);
  private readonly api = inject(Api);

  readonly record = signal<SetupRecord>(start());

  /** No other account in this browser: show the first-account steps. */
  readonly first = computed(() => this.auth.sessions().length <= 1);
  /** Bluesky-first accounts take Bluesky's own, shorter run of steps. */
  readonly network = computed(() => (this.auth.kind() === 'bluesky' ? 'bluesky' : 'mastodon'));

  readonly flow = computed(() => {
    const record = this.record();
    return new SetupFlow(
      {
        first: this.first(),
        network: this.network(),
        purpose: record.purpose,
        movers: record.movers,
      },
      record,
    );
  });

  /**
   * The Mastodon settings the onboarding card also writes (locked,
   * discoverable, indexable, default visibility, posting language): one shared
   * adapter, so setup and Settings → Privacy send identical requests.
   */
  readonly server = new MastodonOnboardingServer(this.api, inject(ClientPrefs));
  private serverLoaded = false;

  /**
   * Setup treats a Mastodon verification 403 as pending. The status alone
   * does not identify the reason. While pending, the intro step offers to
   * save a draft. Profile and discoverability edits still use server writes.
   */
  readonly pending = signal(false);

  checkAccount(): void {
    // Bluesky has no approval queue: a new account can act at once.
    if (this.network() === 'bluesky') return;
    this.api.verifyCredentials().subscribe({
      next: () => this.pending.set(false),
      error: (err: { status?: number }) => this.pending.set(err?.status === 403),
    });
  }

  /** Run by Next for the step on screen. */
  commit: (() => Promise<void> | void) | null = null;

  loadServer(): void {
    if (this.serverLoaded) return;
    this.serverLoaded = true;
    this.server.load();
  }

  save(change: Partial<SetupRecord>): void {
    const record = { ...this.record(), ...change };
    this.record.set(record);
    writeSetup(record);
  }

  /**
   * Mark onboarding-card questions as answered because setup asked them, so
   * … → Onboarding does not ask them again (spec § Relationship).
   */
  absorb(accountIds: readonly string[], appIds: readonly string[] = []): void {
    const account = readOnboardingAccount() ?? emptyOnboardingAccount();
    writeOnboardingAccount({
      ...account,
      pending: false,
      answered: [...new Set([...account.answered, ...accountIds])],
    });
    if (!appIds.length) return;
    const app = readOnboardingApp();
    writeOnboardingApp({ ...app, answered: [...new Set([...app.answered, ...appIds])] });
  }
}

/** The stored record, marked running so Home stops redirecting here. */
function start(): SetupRecord {
  const stored = readSetup();
  const record: SetupRecord = stored
    ? { ...stored, state: stored.state === 'armed' ? 'running' : stored.state }
    : { version: 1, state: 'running', source: 'young', answered: [] };
  writeSetup(record);
  return record;
}

/**
 * Register what Next applies for the step being constructed. Call from a step
 * component's field initializer or constructor; the hook is dropped when the
 * step leaves the screen.
 */
export function onSetupNext(commit: () => Promise<void> | void): SetupState {
  const state = inject(SetupState);
  state.commit = commit;
  inject(DestroyRef).onDestroy(() => {
    if (state.commit === commit) state.commit = null;
  });
  return state;
}
