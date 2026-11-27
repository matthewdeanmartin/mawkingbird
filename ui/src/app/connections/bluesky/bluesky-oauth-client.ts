import {
  OAuthClient,
  WebcryptoKey,
  type OAuthClientOptions,
  type Session,
  type InternalStateData,
  type Key,
} from '@atproto/oauth-client-browser';

/** Never adopt the old origin-wide SDK database: its rows don't identify the client. */
export function oauthDatabaseName(clientId: string): string {
  return `mawkingbird-oauth:${clientId}`;
}

interface StoredValue<T> {
  value: Omit<T, 'dpopKey'>;
  keyPair: CryptoKeyPair;
  keyId: string;
  expiresAt?: number;
}

/** IndexedDB keeps non-extractable DPoP CryptoKeys intact, never in localStorage. */
export class BlueskyOAuthDatabase {
  private readonly db: Promise<IDBDatabase>;

  constructor(clientId: string) {
    this.db = new Promise((resolve, reject) => {
      const request = indexedDB.open(oauthDatabaseName(clientId), 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('session');
        request.result.createObjectStore('state');
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }

  store<T extends { dpopKey: Key }>(name: 'session' | 'state') {
    return {
      get: async (key: string): Promise<T | undefined> => {
        const row = await this.run<StoredValue<T> | undefined>(name, 'readonly', (s) => s.get(key));
        if (!row) return undefined;
        if (row.expiresAt !== undefined && row.expiresAt <= Date.now()) {
          await this.run(name, 'readwrite', (s) => s.delete(key));
          return undefined;
        }
        return {
          ...row.value,
          dpopKey: await WebcryptoKey.fromKeypair(row.keyPair, row.keyId),
        } as unknown as T;
      },
      set: async (key: string, value: T): Promise<void> => {
        const { dpopKey, ...rest } = value;
        if (!(dpopKey instanceof WebcryptoKey) || !dpopKey.kid) throw new Error('Invalid DPoP key');
        const row: StoredValue<T> = {
          value: rest,
          keyPair: dpopKey.cryptoKeyPair,
          keyId: dpopKey.kid,
          ...(name === 'state' ? { expiresAt: Date.now() + 10 * 60_000 } : {}),
        };
        await this.run(name, 'readwrite', (s) => {
          if (name === 'state') {
            const cursor = s.openCursor();
            cursor.onsuccess = () => {
              const entry = cursor.result;
              if (!entry) return;
              if (entry.value.expiresAt <= Date.now()) entry.delete();
              entry.continue();
            };
          }
          return s.put(row, key);
        });
      },
      del: async (key: string): Promise<void> => {
        await this.run(name, 'readwrite', (s) => s.delete(key));
      },
    };
  }

  private async run<T>(
    name: string,
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await this.db;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(name, mode, { durability: 'strict' });
      const request = action(tx.objectStore(name));
      // A successful request isn't a committed transaction. Refresh tokens rotate once.
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? new Error('OAuth storage transaction aborted'));
      tx.onerror = () => reject(tx.error);
    });
  }
}

/** Use the SDK's public core API: browser wrapper 0.5.9 hardcodes origin-wide storage. */
export function createBlueskyOAuthClient(
  options: Pick<
    OAuthClientOptions,
    'clientMetadata' | 'onSessionDeleted' | 'onSessionUpdated' | 'handleResolver'
  >,
): OAuthClient {
  const clientId = options.clientMetadata.client_id;
  if (!clientId) throw new Error('OAuth client ID is required');
  const database = new BlueskyOAuthDatabase(clientId);
  return new OAuthClient({
    ...options,
    responseMode: 'fragment',
    sessionStore: database.store<Session>('session'),
    stateStore: database.store<InternalStateData>('state'),
    runtimeImplementation: {
      createKey: (algs) => WebcryptoKey.generate(algs),
      getRandomValues: (length) => crypto.getRandomValues(new Uint8Array(length)),
      digest: async (data, { name }) =>
        new Uint8Array(await crypto.subtle.digest(`SHA-${name.slice(3)}`, data)),
      ...(navigator.locks
        ? {
            requestLock: (name, fn) =>
              navigator.locks.request(`mawkingbird-oauth:${clientId}:${name}`, () =>
                Promise.resolve(fn()),
              ),
          }
        : {}),
    },
  });
}
