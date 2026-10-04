import { Component } from '@angular/core';
import { bootstrapApplication, BootstrapContext } from '@angular/platform-browser';
import { provideRouter, RouterOutlet, TitleStrategy } from '@angular/router';
import { provideServerRendering, RenderMode, withRoutes } from '@angular/ssr';
import { PageTitleStrategy } from './app/a11y/page-title-strategy';
import { Features } from './app/pages/features/features';
import { FEATURES_DESCRIPTION } from './app/seo';

// Only public content executes at build time. The browser still bootstraps the
// normal client, including its existing root dispatcher. No account data or
// remote instance is needed to produce these pages; hydration is not enabled.
@Component({ selector: 'app-root', imports: [RouterOutlet], template: '<router-outlet />' })
class PublicRoot {}

// Angular's server route map requires a matching router entry for CSR paths.
// This empty server-only placeholder is never prerendered; the browser uses
// the real EntryPage and its existing preview dispatcher.
@Component({ selector: 'app-client-entry', template: '' })
class ClientEntry {}

export default (context: BootstrapContext) =>
  bootstrapApplication(
    PublicRoot,
    {
      providers: [
        provideRouter([
          { path: '', pathMatch: 'full', component: ClientEntry },
          {
            path: 'features',
            component: Features,
            title: 'Mastodon, reading and writing features',
            data: { seoIndexable: true, seoDescription: FEATURES_DESCRIPTION },
          },
        ]),
        { provide: TitleStrategy, useClass: PageTitleStrategy },
        provideServerRendering(
          withRoutes([
            { path: '', renderMode: RenderMode.Client },
            { path: 'features', renderMode: RenderMode.Prerender },
            { path: '**', renderMode: RenderMode.Client },
          ]),
        ),
      ],
    },
    context,
  );
