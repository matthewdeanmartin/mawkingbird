import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { DESIGN_BODY, FUNDING_BODY } from '../docs/public-copy';
import { LEGAL_LINKS, LEGAL_OVERVIEW, LEGAL_RULES_OVERVIEW } from '../docs/legal-content';
import { AppOnlyLinkRel } from '../public-page-urls';

export type PublicArticleKind = 'about' | 'funding' | 'legal';

interface PublicArticleContent {
  heading: string;
  /** Trusted, hand-authored HTML shared with the in-app virtual tweet. */
  body?: string;
}

const ARTICLES: Record<PublicArticleKind, PublicArticleContent> = {
  about: { heading: 'Why Mawkingbird exists', body: DESIGN_BODY },
  funding: { heading: 'How Mawkingbird is funded', body: FUNDING_BODY },
  legal: { heading: 'About & legal' },
};

/**
 * Stable public copies of About, Funding and Legal. Each in-app counterpart
 * has its own route; public English copy is independent of session, instance
 * and runtime dictionaries.
 */
@Component({
  selector: 'app-public-article',
  imports: [RouterLink, AppOnlyLinkRel, MbButton, MbContentLink],
  templateUrl: './public-article.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './features.css',
})
export class PublicArticle {
  readonly kind: PublicArticleKind = inject(ActivatedRoute).snapshot.data['article'];
  readonly content = ARTICLES[this.kind];
  readonly legalLinks = LEGAL_LINKS;
  readonly legalOverview = LEGAL_OVERVIEW;
  readonly legalRulesOverview = LEGAL_RULES_OVERVIEW;
}
