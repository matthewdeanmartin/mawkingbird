import { Component, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { FeatureFlags } from '../../feature-flags';
import { SearchServer } from '../../search-server';
import { SearchServerAbout } from '../../search-server-about';
import { ServerAbout } from '../../server-about';

/**
 * Docs hub: a centre-column index of the "blog-post"-style pages (Design,
 * Credits) plus the server's own legal pages (Rules, Terms) when it publishes
 * them. This is where Server rules / Terms / Credits moved to once they came off
 * the More menu — reachable, but no longer taking a top-level slot.
 */
/** English source strings; see scripts/extract-i18n.mjs. */
// i18n docs.head: Docs
// i18n docs.design.title: Design
// i18n docs.design.detail: Why this client exists — read it as a post.
// i18n docs.plans.title: Plans
// i18n docs.plans.detail: Exactly what free and Plus include, with every limit spelled out.
// i18n docs.funding.title: Funding
// i18n docs.funding.detail: What this costs, who pays for it, and where it's going.
// i18n docs.credits.title: Credits &amp; Privacy
// i18n docs.credits.detail: The software this client ships, and how it handles data.
// i18n docs.serverRules.title: Server rules
// i18n docs.serverRules.detail: The rules published by your instance.
// i18n docs.terms.title: Terms of Service
// i18n docs.terms.detail: Your instance's terms of service.
// i18n docs.serverRulesFor: Server rules — {{host}}
// i18n docs.searchServerRules.detail: The rules published by your search server.
// i18n docs.termsOfServiceFor: Terms of Service — {{host}}
// i18n docs.searchServerTerms.detail: Your search server's terms of service.
@Component({
  selector: 'app-docs',
  imports: [RouterLink, TranslocoPipe],
  templateUrl: './docs.html',
  styleUrl: './docs.css',
})
export class Docs implements OnInit {
  protected featureFlags = inject(FeatureFlags);
  protected serverAbout = inject(ServerAbout);
  protected searchServerAbout = inject(SearchServerAbout);
  protected searchServer = inject(SearchServer);

  ngOnInit(): void {
    // So the Rules/Terms rows can appear only when the instance actually has them.
    this.serverAbout.load();
    // Two servers means two sets of house rules; list the search server's too.
    this.searchServerAbout.load();
  }
}
