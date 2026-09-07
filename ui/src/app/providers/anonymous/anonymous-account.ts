import { computed, Injectable, signal } from '@angular/core';
import { Account } from '../../models';
import { normalizeHostUrl } from '../../host-url';

const STORAGE_KEY = 'mockingbird_anonymous_account';
const DEFAULT_SERVER = 'https://mastodon.social';
const STATE_VERSION = 1;

interface AnonymousAccountState {
  version: typeof STATE_VERSION;
  server: string;
  account: Account;
}

export interface AnonymousProfileUpdate {
  displayName: string;
  username: string;
  note: string;
  fields: { name: string; value: string }[];
}

function host(server: string): string {
  try {
    return new URL(server).host;
  } catch {
    return 'mastodon.social';
  }
}

function defaultAccount(server: string): Account {
  const instance = host(server);
  return {
    id: 'anonymous',
    username: instance,
    acct: instance,
    display_name: 'Anonymous',
    note: '',
    url: '',
    avatar: 'favicon-32x32.png',
    avatar_static: 'favicon-32x32.png',
    header: '',
    header_static: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    discoverable: false,
    fields: [],
    role: null,
    source: {
      privacy: 'public',
      sensitive: false,
      language: null,
      note: '',
      fields: [],
    },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function readImage(file: File, maxBytes: number): Promise<string> {
  if (!file.type.startsWith('image/')) {
    return Promise.reject(new Error('Choose an image file.'));
  }
  if (file.size > maxBytes) {
    return Promise.reject(
      new Error(`Image is too large (maximum ${Math.floor(maxBytes / 1_000_000)} MB).`),
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });
}

function loadState(): AnonymousAccountState | null {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<AnonymousAccountState> | null;
    if (
      parsed?.version !== STATE_VERSION ||
      typeof parsed.server !== 'string' ||
      !parsed.account ||
      parsed.account.id !== 'anonymous'
    ) {
      return null;
    }
    return parsed as AnonymousAccountState;
  } catch {
    return null;
  }
}

/**
 * Owns the single browser-local Anonymous identity.
 *
 * Other anonymous social state will join this provider namespace in later
 * sprints. Auth only selects this identity; profile details never become part
 * of the authenticated Mastodon session format.
 */
@Injectable({ providedIn: 'root' })
export class AnonymousAccount {
  private state = signal<AnonymousAccountState | null>(loadState());

  readonly server = computed(() => this.state()?.server ?? DEFAULT_SERVER);
  readonly account = computed(() => this.state()?.account ?? defaultAccount(this.server()));

  /**
   * Whether this identity has ever been used in this browser. `account()` always
   * answers with a default so callers never handle null, which means it cannot
   * distinguish "set up" from "never touched" — the left rail needs to, so it
   * doesn't advertise a card for an identity the user has never entered.
   */
  readonly activated = computed(() => this.state() !== null);

  /** Activate the identity, optionally moving its home-instance context. */
  activate(server?: string): void {
    const normalized =
      normalizeHostUrl(server ?? this.state()?.server ?? DEFAULT_SERVER) || DEFAULT_SERVER;
    const current = this.state();
    if (current) {
      const oldHost = host(current.server);
      const newHost = host(normalized);
      const account = {
        ...current.account,
        username: current.account.username === oldHost ? newHost : current.account.username,
        acct: current.account.acct === oldHost ? newHost : current.account.acct,
      };
      this.persist({ ...current, server: normalized, account });
      return;
    }
    this.persist({
      version: STATE_VERSION,
      server: normalized,
      account: defaultAccount(normalized),
    });
  }

  /** Replace locally editable profile fields without exposing storage to the UI. */
  updateAccount(account: Account): void {
    this.persist({
      version: STATE_VERSION,
      server: this.server(),
      account: { ...account, id: 'anonymous' },
    });
  }

  /** Validate and persist every locally editable profile field. */
  async updateProfile(
    update: AnonymousProfileUpdate,
    avatar: File | null,
    header: File | null,
  ): Promise<Account> {
    const current = this.account();
    const username = update.username.trim().replace(/^@/, '').slice(0, 64) || host(this.server());
    const displayName = update.displayName.trim().slice(0, 30) || 'Anonymous';
    const rawNote = update.note.slice(0, 500);
    const sourceFields = update.fields
      .filter((field) => field.name.trim() || field.value.trim())
      .slice(0, 4)
      .map((field) => ({
        name: field.name.trim().slice(0, 255),
        value: field.value.trim().slice(0, 255),
      }));
    const [avatarUrl, headerUrl] = await Promise.all([
      avatar ? readImage(avatar, 2_000_000) : Promise.resolve(current.avatar),
      header ? readImage(header, 4_000_000) : Promise.resolve(current.header),
    ]);
    const renderedFields = sourceFields.map((field) => ({
      name: escapeHtml(field.name),
      value: escapeHtml(field.value),
    }));
    const renderedNote = rawNote ? `<p>${escapeHtml(rawNote).replaceAll('\n', '<br>')}</p>` : '';
    const account: Account = {
      ...current,
      username,
      acct: username,
      display_name: displayName,
      note: renderedNote,
      avatar: avatarUrl,
      avatar_static: avatarUrl,
      header: headerUrl,
      header_static: headerUrl,
      fields: renderedFields,
      source: {
        ...(current.source ?? {
          privacy: 'public',
          sensitive: false,
          language: null,
          note: '',
          fields: [],
        }),
        note: rawNote,
        fields: sourceFields,
      },
    };
    this.updateAccount(account);
    return account;
  }

  /** Reset profile presentation while retaining the selected home instance. */
  resetIdentity(): void {
    this.persist({
      version: STATE_VERSION,
      server: this.server(),
      account: defaultAccount(this.server()),
    });
  }

  private persist(state: AnonymousAccountState): void {
    this.state.set(state);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}
