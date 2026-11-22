import { ReadingHistory } from './shell/reading-history';
import { proxyLimitInterceptor } from './connections/cors-proxy/proxy-limit.interceptor';
import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  RouteReuseStrategy,
  Router,
  TitleStrategy,
  withInMemoryScrolling,
  withPreloading,
  withRouterConfig,
} from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { providePublicPageUrls } from './public-pages/public-page-urls';
import { authInterceptor } from './platform/http/auth.interceptor';
import { healthInterceptor } from './platform/http/health.interceptor';
import { serverInterceptor } from './platform/http/server.interceptor';
import { mastodonRouteInterceptor } from './platform/http/mastodon-route.interceptor';
import { metricsInterceptor } from './observability/metrics.interceptor';
import { connectionMeterInterceptor } from './platform/network/connection-meter.interceptor';
import { networkSimulatorInterceptor } from './platform/network/network-simulator';
import { requestPolicyInterceptor } from './platform/network/request-policy';
import { readCacheInterceptor } from './platform/offline/read-cache.interceptor';
import { GlobalErrorHandler } from './platform/diagnostics/global-error-handler';
import { SettingsPreloading } from './settings/settings-preloading';
import { dedupeInterceptor } from './platform/http/dedupe.interceptor';
import { rateLimitInterceptor } from './platform/http/rate-limit.interceptor';
import { plusTokenInterceptor } from './accounts/mawkingbird/plus-token.interceptor';
import { PageTitleStrategy } from './shell/a11y/page-title-strategy';
import { provideI18nForApp } from './i18n/i18n.config';
import { AppInstall } from './shell/app-install/app-install';
import { PLATFORM_HTTP_INTERCEPTORS } from './platform/http/platform-http';

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: RouteReuseStrategy, useExisting: ReadingHistory },
    provideAppInitializer(() => inject(ReadingHistory).start(inject(Router))),
    // Forwards window `error` / `unhandledrejection` to Angular's ErrorHandler,
    // so a failed dynamic import (a rejected promise) reaches GlobalErrorHandler.
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    // Chrome fires its one install prompt early; catch it before any page asks.
    provideAppInitializer(() => {
      inject(AppInstall);
    }),
    // Interface language. Dictionaries load at runtime from i18n/{lang}.json;
    // see i18n/i18n.config.ts for why this is not @angular/localize.
    provideI18nForApp(),
    // Per-route document titles; see page-title-strategy.ts for why the
    // default strategy is not enough.
    { provide: TitleStrategy, useClass: PageTitleStrategy },
    // Public pages are linked with their trailing slash; see public-page-urls.ts.
    providePublicPageUrls(routes),
    provideRouter(
      routes,
      // A cancelled Back (zen/unsaved writing) must restore the history index,
      // rather than replace the preceding page with the editor URL.
      withRouterConfig({ canceledNavigationResolution: 'computed' }),
      withPreloading(SettingsPreloading),
      // ReadingHistory coordinates top/anchor scrolling with retained-view restoration.
      withInMemoryScrolling({ anchorScrolling: 'disabled', scrollPositionRestoration: 'disabled' }),
    ),
    // metricsInterceptor is outermost so it times the full round-trip (including
    // the server/auth rewrites) and sees the final response/error.
    provideHttpClient(
      withInterceptors([
        // First: a refused Mastodon route never reaches metrics or the network.
        mastodonRouteInterceptor,
        metricsInterceptor,
        // Saves first-page reads and answers them offline; outside the read
        // policy so a saved copy is used only once its retries gave up.
        readCacheInterceptor,
        // Inside metrics (one call, total time), outside everything that
        // rewrites, authenticates, measures or health-checks an attempt.
        requestPolicyInterceptor,
        serverInterceptor,
        dedupeInterceptor,
        rateLimitInterceptor,
        healthInterceptor,
        authInterceptor,
        // Last, so it sees the final URL: `serverInterceptor` may still have
        // been rewriting it earlier in the chain.
        plusTokenInterceptor,
        proxyLimitInterceptor,
        // Innermost before the transport, so client-side queueing (rate-limit
        // waits, deduped repeats, refused routes) is never mistaken for the
        // network being slow.
        connectionMeterInterceptor,
        // Inert unless a test profile is picked; inside the meter so the
        // simulated conditions are measured like real ones.
        networkSimulatorInterceptor,
        ...PLATFORM_HTTP_INTERCEPTORS,
      ]),
    ),
  ],
};
