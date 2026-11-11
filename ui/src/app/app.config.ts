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
import { metricsInterceptor } from './observability/metrics.interceptor';
import { GlobalErrorHandler } from './platform/diagnostics/global-error-handler';
import { SettingsPreloading } from './settings/settings-preloading';
import { dedupeInterceptor } from './platform/http/dedupe.interceptor';
import { rateLimitInterceptor } from './platform/http/rate-limit.interceptor';
import { plusTokenInterceptor } from './accounts/mawkingbird/plus-token.interceptor';
import { PageTitleStrategy } from './shell/a11y/page-title-strategy';
import { provideI18nForApp } from './i18n/i18n.config';
import { AppInstall } from './shell/app-install/app-install';

export const appConfig: ApplicationConfig = {
  providers: [
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
      // Enables fragment scrolling (e.g. /credits#privacy from the footer).
      //
      // `scrollPositionRestoration: 'top'` is the other half, and its absence was
      // a real bug rather than a nicety: the option defaults to `'disabled'`,
      // which means Angular never touches scroll on navigation at all. So
      // clicking a link two screens down a long page landed you two screens down
      // the *next* page — most visibly in Settings, where the sidebar is tall
      // enough that a tab click from the bottom of Connections dropped you at the
      // bottom of the next tab, below the button you went there to press.
      //
      // 'top' rather than 'enabled': 'enabled' restores the previous offset on
      // back/forward, which is right for a feed you are returning to but wrong
      // here, where every settings tab is a fresh page. Pages that need to
      // restore their own position (search) do it themselves.
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'top' }),
    ),
    // metricsInterceptor is outermost so it times the full round-trip (including
    // the server/auth rewrites) and sees the final response/error.
    provideHttpClient(
      withInterceptors([
        metricsInterceptor,
        serverInterceptor,
        dedupeInterceptor,
        rateLimitInterceptor,
        healthInterceptor,
        authInterceptor,
        // Last, so it sees the final URL: `serverInterceptor` may still have
        // been rewriting it earlier in the chain.
        plusTokenInterceptor,
        proxyLimitInterceptor,
      ]),
    ),
  ],
};
