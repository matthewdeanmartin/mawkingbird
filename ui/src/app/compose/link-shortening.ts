import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { PageDiagnostics } from '../page-diagnostics';
import { CorsProxy } from '../providers/cors-proxy/cors-proxy';
import { CorsProxyEntry } from '../providers/cors-proxy/cors-proxy-catalog';
import { longUrls } from './post-length';
import { ShortenerCatalogEntry, shortenerEntry } from '../providers/shortener/shortener-catalog';
import { ShortenerProxyConsent } from '../providers/shortener/proxy-consent';
import { ShortenerRegistry } from '../providers/shortener/shortener-registry';
import { ShortenerSettings } from '../providers/shortener/shortener-settings';
import { ProxyConsentRequired } from '../providers/shortener/shortener-transport';

/** The consent a shortener needs before its request goes through a CORS proxy. */
export interface ShortenerConsentPrompt {
  shortener: ShortenerCatalogEntry;
  proxy: CorsProxyEntry;
  carriesCredential: boolean;
}

/**
 * Replacing long links in a body of text with short ones.
 *
 * Lifted out of the compact composer so the writing page can offer the same
 * thing. What makes it worth a service rather than a copied method is not the
 * loop — it is everything around the loop: a provider that may refuse direct
 * browser requests, a CORS proxy that may or may not be configured, a consent
 * step that must happen before a credential is disclosed to that proxy, and the
 * rule that a failure leaves the user's text *completely* untouched.
 *
 * Not `providedIn: 'root'`: the busy flag and the error belong to one editor.
 */
@Injectable()
export class LinkShortening {
  private shorteners = inject(ShortenerRegistry);
  private settings = inject(ShortenerSettings);
  private consent = inject(ShortenerProxyConsent);
  private corsProxy = inject(CorsProxy);
  private diagnostics = inject(PageDiagnostics);

  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly consentPrompt = signal<ShortenerConsentPrompt | null>(null);

  /** Whether a shortener is connected and usable. */
  readonly ready = computed(() => this.settings.usable());

  /** The connected shortener's name, for the button label. */
  readonly name = computed(() => this.settings.chosen()?.label ?? '');

  /** The links in `text` long enough to be worth shortening. */
  longLinks(text: string): ReturnType<typeof longUrls> {
    return longUrls(text);
  }

  /**
   * Shorten every long link in `text` and return the rewritten body.
   *
   * Returns null when nothing was changed — no links, already running, or a
   * failure. The caller writes the result back itself, so a partial failure can
   * never leave half-rewritten text in the editor: either every link was
   * replaced or the body the user typed is still exactly what is on screen.
   *
   * Replacements run back-to-front so that each earlier offset is still valid
   * after the ones behind it have changed length.
   */
  async shorten(text: string): Promise<string | null> {
    const targets = this.longLinks(text);
    if (!targets.length || this.busy()) {
      return null;
    }
    this.busy.set(true);
    this.error.set(null);
    try {
      let next = text;
      for (const target of [...targets].reverse()) {
        const link = await firstValueFrom(this.shorteners.create({ destinationUrl: target.url }));
        next = next.slice(0, target.start) + link.shortUrl + next.slice(target.end);
      }
      return next;
    } catch (error) {
      this.report(error);
      return null;
    } finally {
      this.busy.set(false);
    }
  }

  /** Grant the pending proxy consent. The caller retries; this only records it. */
  acceptConsent(): boolean {
    const prompt = this.consentPrompt();
    this.consentPrompt.set(null);
    if (!prompt) {
      return false;
    }
    this.consent.grant(prompt.shortener.id, prompt.proxy.id);
    return true;
  }

  declineConsent(): void {
    const prompt = this.consentPrompt();
    this.consentPrompt.set(null);
    if (prompt) {
      this.error.set(
        `Not sent through ${prompt.proxy.label}. The direct attempt also failed. Retry later, or ` +
          `choose a different CORS proxy in Settings. Your post is unchanged.`,
      );
    }
  }

  private report(error: unknown): void {
    this.diagnostics.error('Shortener', 'compose:error', error, {
      provider: this.settings.activeId(),
      proxyConfigured: this.corsProxy.available(),
    });
    if (error instanceof ProxyConsentRequired) {
      const shortener = shortenerEntry(error.shortener);
      const proxy = this.corsProxy.entry();
      if (!error.noProxyConfigured && shortener && proxy) {
        this.consentPrompt.set({ shortener, proxy, carriesCredential: error.carriesCredential });
        return;
      }
      this.error.set(
        `${shortener?.label ?? 'The shortener'} could not be reached directly, and no CORS ` +
          `proxy is ready. Set one up under Settings → Connections → CORS proxy, or retry later. ` +
          `Your post is unchanged.`,
      );
      return;
    }
    this.error.set(
      error instanceof Error && error.message
        ? error.message
        : "Couldn't shorten that link. Your post is unchanged.",
    );
  }
}
