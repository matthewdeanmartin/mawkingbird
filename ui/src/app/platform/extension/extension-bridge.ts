import { Injectable } from '@angular/core';

/**
 * Mawkingbird for Firefox's bridge, seen from the app (spec/firefox-extension.md,
 * sprint 6). When the extension is installed, its content script marks
 * `<html data-mawkingbird-extension>` before the app starts, and the app can ask
 * it to read public pages and feeds that CORS blocks, from the reader's own
 * computer, once the reader has allowed that site.
 *
 * Same protocol as extension/client/bridge-client.js (the reference client,
 * documented in extension/client/PROTOCOL.md); keep the two in step. In Native
 * and in browsers without the extension, `present()` is false and nothing here
 * sends a message.
 */
export const EXTENSION_PROTOCOL = 'mawkingbird-extension/1';

export type ExtensionPurpose = 'feed' | 'article' | 'json';

export type ExtensionRead =
  | { ok: true; status: number; finalUrl: string; contentType: string; body: string }
  | {
      ok: false;
      error:
        'needs-access' | 'refused' | 'network' | 'timeout' | 'type' | 'too-large' | 'unavailable';
      detail?: string;
      origin?: string;
    };

/** Answers can wait on the reader (the grant window), so allow them time. */
const ANSWER_TIMEOUT_MS = 120_000;

/**
 * A read the extension could do once the reader allows `origin`. Carried as the
 * error of a failed fetch so the screen showing the failure can offer
 * "Let Mawkingbird for Firefox read <site>".
 */
export class ExtensionAccessNeeded extends Error {
  constructor(
    readonly origin: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ExtensionAccessNeeded';
  }
}

/** The site an {@link ExtensionAccessNeeded} anywhere in an error's chain names, or null. */
export function extensionAccessOrigin(error: unknown): string | null {
  for (let current = error, depth = 0; current && depth < 4; depth++) {
    if (current instanceof ExtensionAccessNeeded) return current.origin;
    current = current instanceof Error ? current.cause : null;
  }
  return null;
}

@Injectable({ providedIn: 'root' })
export class ExtensionBridge {
  private counter = 0;

  /** Whether the extension's content script marked this page. */
  present(): boolean {
    return (
      typeof document !== 'undefined' &&
      document.documentElement.dataset['mawkingbirdExtension'] === EXTENSION_PROTOCOL
    );
  }

  /** A public page or feed, read by the extension. Never rejects. */
  read(url: string, purpose: ExtensionPurpose): Promise<ExtensionRead> {
    return this.ask({ op: 'fetch', url, purpose }) as Promise<ExtensionRead>;
  }

  /**
   * Opens the extension's "Let Mawkingbird read <site>?" window. Call it only
   * from the reader's click on a button that says so.
   */
  async requestAccess(origin: string): Promise<boolean> {
    const answer = (await this.ask({ op: 'requestAccess', origin })) as {
      ok?: boolean;
      granted?: boolean;
    };
    if (answer.ok) return answer.granted === true;
    // Firefox may have suspended the extension while the window was open; the
    // answer is lost but the grant stands, so ask again.
    const recheck = (await this.ask({ op: 'hasAccess', origin })) as { granted?: boolean };
    return recheck.granted === true;
  }

  private ask(request: Record<string, string>): Promise<unknown> {
    if (!this.present()) {
      return Promise.resolve({ ok: false, error: 'unavailable', detail: 'No extension.' });
    }
    const id = `mb-${Date.now().toString(36)}-${(this.counter += 1)}`;
    return new Promise((resolve) => {
      const done = (result: unknown) => {
        window.removeEventListener('message', onMessage);
        clearTimeout(timer);
        resolve(result ?? { ok: false, error: 'unavailable' });
      };
      const onMessage = (event: MessageEvent) => {
        const data = event.data as {
          channel?: string;
          direction?: string;
          id?: string;
          result?: unknown;
        } | null;
        if (event.source !== window || event.origin !== window.location.origin) return;
        if (data?.channel !== EXTENSION_PROTOCOL || data.direction !== 'to-page') return;
        if (data.id === id) done(data.result);
      };
      const timer = setTimeout(
        () => done({ ok: false, error: 'unavailable', detail: 'No answer.' }),
        ANSWER_TIMEOUT_MS,
      );
      window.addEventListener('message', onMessage);
      window.postMessage(
        { channel: EXTENSION_PROTOCOL, direction: 'to-extension', id, ...request },
        window.location.origin,
      );
    });
  }
}

/** `blog.example` for a button label. */
export function siteName(origin: string): string {
  try {
    return new URL(origin).host.replace(/^www\./, '');
  } catch {
    return origin;
  }
}
