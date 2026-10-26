import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MbButton } from '../../design-system/button/button';
import { MbContentLink } from '../../design-system/metadata/metadata';
import { DESIGN_BODY, FUNDING_BODY } from '../docs/public-copy';

export type PublicArticleKind = 'about' | 'funding' | 'blog';

interface PublicArticleContent {
  heading: string;
  /** Trusted, hand-authored HTML shared with the in-app virtual tweet. */
  body?: string;
}

const ARTICLES: Record<PublicArticleKind, PublicArticleContent> = {
  about: { heading: 'Why Mawkingbird exists', body: DESIGN_BODY },
  funding: { heading: 'How Mawkingbird is funded', body: FUNDING_BODY },
  blog: { heading: 'Mawkingbird blog' },
};

/**
 * Build-time copy of About, Funding and the Blog hub for search engines.
 *
 * Only `main.server.ts` routes here. In the browser the same URLs belong to the
 * signed-in shell, which renders these essays as virtual tweets; there is no
 * hydration, so this markup is replaced as soon as the app boots. Public English
 * reference, independent of session, instance and runtime dictionaries.
 */
@Component({
  selector: 'app-public-article',
  imports: [RouterLink, MbButton, MbContentLink],
  templateUrl: './public-article.html',
  styleUrl: './features.css',
})
export class PublicArticle {
  readonly kind: PublicArticleKind = inject(ActivatedRoute).snapshot.data['article'];
  readonly content = ARTICLES[this.kind];
}
