import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { catchError, firstValueFrom, of, timeout } from 'rxjs';
import { AnonymousPublicApi } from '../../accounts/anonymous/anonymous-public-api';
import { anonymousStatusRouteRef } from '../../accounts/anonymous/anonymous-route-ref';
import { BlueskyApi } from '../../connections/bluesky/bluesky-api';
import { MbNotice } from '../../design-system/notice/notice';
import { Api } from '../../platform/api/api';
import { Server } from '../../platform/http/server';
import { Auth } from '../../platform/session/auth';
import { isTwitterHandle, serverHost } from './deep-links';

// i18n deepLink.opening: Opening…
// i18n deepLink.notFound: This link could not be opened here.
// i18n deepLink.openOriginal: Open it on {{host}}

/** Which copied-link shape the route matched. Set as route `data.kind`. */
export type DeepLinkKind = 'mastodon-post' | 'account' | 'bsky-post' | 'bsky-profile' | 'twitter';

const RESOLVE_TIMEOUT_MS = 15_000;

/**
 * Lands a copied mawkingbird.com link (see deep-links.ts) on the reader's own
 * view of the post or account, then gets out of the way: every navigation
 * replaces this URL, so Back does not bounce through the resolver.
 *
 * Mastodon posts follow Elk: same server → the id as is; another server → ask
 * the reader's server to resolve the issuing server's URL for the post;
 * Anonymous → read it from the issuing server's public API.
 */
@Component({
  selector: 'app-deep-link-page',
  imports: [TranslocoPipe, MbNotice],
  template: `
    <section class="deep-link">
      @if (failed()) {
        <mb-notice tone="info" announcement="alert">
          {{ 'deepLink.notFound' | transloco }}
          @if (original(); as url) {
            <a [href]="url" target="_blank" rel="noopener noreferrer">{{
              'deepLink.openOriginal' | transloco: { host: originalHost() }
            }}</a>
          }
        </mb-notice>
      } @else {
        <p class="muted" aria-live="polite">{{ 'deepLink.opening' | transloco }}</p>
      }
    </section>
  `,
  styles: `
    .deep-link {
      padding: 24px 16px;
    }
    mb-notice a {
      margin-left: 6px;
    }
  `,
})
export class DeepLinkPage implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(Api);
  private readonly anonymousPublic = inject(AnonymousPublicApi);
  private readonly bluesky = inject(BlueskyApi);
  private readonly server = inject(Server);
  private readonly auth = inject(Auth);

  protected readonly failed = signal(false);
  /** The post or profile on its home network, offered when it cannot be opened here. */
  protected readonly original = signal<string | null>(null);
  protected readonly originalHost = signal('');

  async ngOnInit(): Promise<void> {
    const params = this.route.snapshot.paramMap;
    const kind = this.route.snapshot.data['kind'] as DeepLinkKind;
    const target = await this.resolve(kind, (name) => params.get(name) ?? '').catch(() => null);
    if (target) {
      await this.router.navigate(target, { replaceUrl: true });
    } else {
      this.failed.set(true);
    }
  }

  private async resolve(
    kind: DeepLinkKind,
    param: (name: string) => string,
  ): Promise<string[] | null> {
    switch (kind) {
      case 'mastodon-post':
        return this.mastodonPost(param('server'), param('acct'), param('id'));
      case 'account':
        return ['/accounts', `@${param('acct')}`];
      case 'bsky-post':
      case 'bsky-profile': {
        const actor = param('actor');
        this.setOriginal(
          kind === 'bsky-post'
            ? `https://bsky.app/profile/${actor}/post/${param('rkey')}`
            : `https://bsky.app/profile/${actor}`,
        );
        const did = await this.blueskyDid(actor);
        if (!did) return null;
        return kind === 'bsky-post'
          ? ['/statuses', `bsky:at://${did}/app.bsky.feed.post/${param('rkey')}`]
          : ['/accounts', `bsky:${did}`];
      }
      case 'twitter': {
        const user = param('user');
        const id = param('id');
        if (!isTwitterHandle(user) || (id && !/^\d+$/.test(id))) return null;
        this.setOriginal(
          id ? `https://twitter.com/${user}/status/${id}` : `https://twitter.com/${user}`,
        );
        return id ? ['/statuses', `twitter:${id}`] : ['/accounts', `twitter:@${user}`];
      }
      default:
        return null;
    }
  }

  private async mastodonPost(server: string, acct: string, id: string): Promise<string[] | null> {
    const host = serverHost(server);
    if (!host) return null;
    const original = `https://${host}/@${acct}/${id}`;
    this.setOriginal(original);

    if (this.auth.isAnonymous) {
      return [
        '/statuses',
        anonymousStatusRouteRef({ server: `https://${host}`, id, originalUrl: original }),
      ];
    }
    if (this.auth.lacksMastodonToken) {
      // Bluesky- or Misskey-primary without a Mastodon connection: nothing here
      // can resolve a fediverse URL, so offer the original instead.
      return null;
    }
    if (serverHost(this.server.baseUrl()) === host) {
      return ['/statuses', id];
    }
    // Elk's route: the issuing server's page for the post is a URL the
    // reader's server can fetch and resolve. Some servers (authorized fetch,
    // Misskey forks) refuse that, so fall back to the post's canonical
    // ActivityPub id, read from the issuing server's public API.
    const viaPage = await this.resolveOnHome(original);
    if (viaPage) return ['/statuses', viaPage];
    const remote = await firstValueFrom(
      this.anonymousPublic
        .getStatus({ server: `https://${host}`, id, originalUrl: original })
        .pipe(catchError(() => of(null))),
    );
    const canonical = remote?.uri ?? remote?.url ?? null;
    const viaUri = canonical && canonical !== original ? await this.resolveOnHome(canonical) : null;
    return viaUri ? ['/statuses', viaUri] : null;
  }

  private async resolveOnHome(url: string): Promise<string | null> {
    const status = await firstValueFrom(
      this.api.resolveStatusOnHome(url).pipe(
        timeout(RESOLVE_TIMEOUT_MS),
        catchError(() => of(null)),
      ),
    );
    return status?.id ?? null;
  }

  private async blueskyDid(actor: string): Promise<string | null> {
    if (actor.startsWith('did:')) return actor;
    const resolved = await firstValueFrom(
      this.bluesky.resolveHandle(actor).pipe(
        timeout(RESOLVE_TIMEOUT_MS),
        catchError(() => of(null)),
      ),
    );
    return resolved?.did ?? null;
  }

  private setOriginal(url: string): void {
    this.original.set(url);
    this.originalHost.set(serverHost(url) ?? url);
  }
}
