import { computed, inject, Injectable } from '@angular/core';
import { PasteSettings } from './paste-settings';
import { PASTE_SERVICES } from '../publishing-services';
import { GistProvider } from './gist-provider';
import { FeedPasteProvider, PasteProvider } from './paste-provider';
import { RentryProvider } from './rentry-provider';
import { ShortenerPasteProvider } from './shortener-paste-provider';
import { TinyurlProvider } from './tinyurl-provider';

/**
 * Available paste services. Keeping selection here makes a second service additive.
 *
 * ## What earns a place here
 *
 * A public feed is only worth having if you can **post to it and then see your
 * own paste in it**. A feed you cannot post to is a stream of strangers' random
 * content; posting with no feed is still fine (a note to self, or something you
 * share on Mastodon yourself), but read-only-plus-feed is the combination with
 * no use case.
 *
 * That rule cost two candidates:
 *
 * - **paste.centos.org** (Stikked) gates every endpoint — including
 *   `/api/create` — behind an `apikey`, and Stikked issues those only from the
 *   server's admin config. There is no signup, login, or account page. Unless
 *   you run the instance, the key is unobtainable, so nobody can post.
 * - **paste.opensuse.org** has a genuine JSON feed but no create API: `POST`
 *   answers 422 for every body shape, being a Rails form flow behind an
 *   authenticity token (and an antibot interstitial). The openSUSE OpenID
 *   Connect credential does not help — it is a browser login client id, not an
 *   API key, and was rejected as both a bearer token and a parameter.
 *
 * Both would have been feed-only, so both are out.
 */
@Injectable({ providedIn: 'root' })
export class PasteProviderRegistry {
  private settings = inject(PasteSettings);
  private rentry = inject(RentryProvider);
  private tinyurl = inject(TinyurlProvider);
  private shortener = inject(ShortenerPasteProvider);
  private gist = inject(GistProvider);

  /**
   * Every provider this build knows about, whether or not it can be used now.
   *
   * `get()` resolves against this rather than {@link available} on purpose: a
   * draft or a history entry created through the user's shortener must still
   * resolve after they disconnect it, or the record becomes unreadable.
   */
  readonly all: readonly PasteProvider[] = PASTE_SERVICES.map((entry) => {
    const providers = [this.rentry, this.tinyurl, this.shortener, this.gist];
    return providers.find((provider) => provider.id === entry.id)!;
  });

  /**
   * What the composer offers right now.
   *
   * Two conditional entries, for the same reason: the shortener needs a
   * connected service and Gist needs a token, and offering either to someone
   * who has not set one up is an option that can only fail. Rentry and TinyURL cover that case with no setup at all, which is why they stay
   * unconditional.
   */
  readonly available = computed<readonly PasteProvider[]>(() =>
    this.all.filter((provider) => {
      if (provider === this.shortener) {
        return this.shortener.available();
      }
      if (provider === this.gist) {
        return this.gist.available();
      }
      return true;
    }),
  );

  /** Public feed connectors available in this build. */
  readonly feeds: readonly FeedPasteProvider[] = [];

  // Typed as the interface (not RentryProvider) so callers keep the full
  // visibility union; narrowing to one provider's literal types breaks them.
  get default(): PasteProvider {
    return (
      this.available().find((provider) => provider.id === this.settings.selected()) ?? this.rentry
    );
  }

  get(id: string): PasteProvider | undefined {
    return this.all.find((provider) => provider.id === id);
  }

  /** A feed provider by id, including feed-only ones absent from `all`. */
  feed(id: string): FeedPasteProvider | undefined {
    return this.feeds.find((provider) => provider.id === id);
  }
}
