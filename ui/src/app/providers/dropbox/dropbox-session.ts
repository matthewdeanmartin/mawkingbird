import { inject, Injectable, InjectionToken, signal } from '@angular/core';
import { environment } from '../../../environments/environment';
import { codeChallengeFor, createCodeVerifier, createOAuthState, statesMatch } from '../../pkce';

const TOKEN_KEY = 'mockingbird_dropbox_token';
const VERIFIER_KEY = 'mockingbird_dropbox_pkce_verifier';
const STATE_KEY = 'mockingbird_dropbox_oauth_state';

export const DROPBOX_APP_KEY = new InjectionToken<string>('DROPBOX_APP_KEY', {
  providedIn: 'root',
  factory: () => environment.dropboxAppKey,
});

interface StoredDropboxToken {
  accessToken: string;
  accountId?: string;
  expiresAt: number;
}

interface DropboxTokenResponse {
  access_token: string;
  account_id?: string;
  expires_in: number;
}

interface DropboxErrorResponse {
  error_description?: string;
  error_summary?: string;
}

export interface DropboxEntry {
  '.tag': 'file' | 'folder' | 'deleted';
  id?: string;
  name: string;
  path_display?: string;
}

interface DropboxListResponse {
  entries: DropboxEntry[];
}

/** A browser-only Dropbox OAuth/PKCE session using short-lived online tokens. */
@Injectable({ providedIn: 'root' })
export class DropboxSession {
  private appKey = inject(DROPBOX_APP_KEY);
  private token = signal<StoredDropboxToken | null>(readToken());

  readonly connected = signal(this.hasUsableToken());

  get configured(): boolean {
    return this.appKey.trim().length > 0;
  }

  async connect(): Promise<void> {
    if (!this.configured) {
      throw new Error('Dropbox has not been configured for this build yet.');
    }

    const verifier = createCodeVerifier();
    const state = createOAuthState();
    const challenge = await codeChallengeFor(verifier);
    sessionStorage.setItem(VERIFIER_KEY, verifier);
    sessionStorage.setItem(STATE_KEY, state);

    const authorizeUrl = new URL('https://www.dropbox.com/oauth2/authorize');
    authorizeUrl.search = new URLSearchParams({
      client_id: this.appKey,
      response_type: 'code',
      redirect_uri: redirectUri(),
      code_challenge: challenge,
      code_challenge_method: 'S256',
      token_access_type: 'online',
      scope: 'files.metadata.read',
      state,
    }).toString();
    location.assign(authorizeUrl.toString());
  }

  async finishAuthorization(params: URLSearchParams): Promise<void> {
    const oauthError = params.get('error_description') ?? params.get('error');
    if (oauthError) {
      this.clearPendingAuthorization();
      throw new Error(oauthError);
    }

    const code = params.get('code');
    const state = params.get('state');
    const expectedState = sessionStorage.getItem(STATE_KEY);
    const verifier = sessionStorage.getItem(VERIFIER_KEY);
    if (!code || !statesMatch(expectedState, state) || !verifier) {
      this.clearPendingAuthorization();
      throw new Error(
        'Dropbox returned an invalid or expired authorization response. Please try again.',
      );
    }

    try {
      const body = new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: this.appKey,
        redirect_uri: redirectUri(),
        code_verifier: verifier,
      });
      const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
      if (!response.ok) {
        throw new Error(await dropboxError(response, 'Dropbox rejected the authorization code.'));
      }
      const result = (await response.json()) as DropboxTokenResponse;
      const token: StoredDropboxToken = {
        accessToken: result.access_token,
        accountId: result.account_id,
        expiresAt: Date.now() + result.expires_in * 1000,
      };
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify(token));
      this.token.set(token);
      this.connected.set(true);
    } finally {
      this.clearPendingAuthorization();
    }
  }

  async listRoot(): Promise<DropboxEntry[]> {
    const token = this.token();
    if (!token || token.expiresAt <= Date.now() + 30_000) {
      this.disconnect();
      throw new Error('Your Dropbox connection expired. Connect it again to continue.');
    }
    const response = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ path: '', recursive: false, include_deleted: false, limit: 100 }),
    });
    if (!response.ok) {
      if (response.status === 401) {
        this.disconnect();
      }
      throw new Error(await dropboxError(response, "Couldn't list your Dropbox files."));
    }
    return ((await response.json()) as DropboxListResponse).entries;
  }

  disconnect(): void {
    sessionStorage.removeItem(TOKEN_KEY);
    this.token.set(null);
    this.connected.set(false);
  }

  private hasUsableToken(): boolean {
    const token = this.token();
    if (token && token.expiresAt > Date.now() + 30_000) {
      return true;
    }
    sessionStorage.removeItem(TOKEN_KEY);
    this.token.set(null);
    return false;
  }

  private clearPendingAuthorization(): void {
    sessionStorage.removeItem(VERIFIER_KEY);
    sessionStorage.removeItem(STATE_KEY);
  }
}

function redirectUri(): string {
  return `${location.origin}/integrations/dropbox/callback`;
}

function readToken(): StoredDropboxToken | null {
  try {
    return JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null') as StoredDropboxToken | null;
  } catch {
    sessionStorage.removeItem(TOKEN_KEY);
    return null;
  }
}

async function dropboxError(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as DropboxErrorResponse;
    if (body.error_summary?.startsWith('missing_scope/')) {
      return 'This Dropbox connection is missing files.metadata.read. Enable that permission in the Dropbox App Console, then disconnect and reconnect.';
    }
    return body.error_description ?? body.error_summary ?? fallback;
  } catch {
    return fallback;
  }
}
