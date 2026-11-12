import { Component, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../../design-system/button/button';
import { SearchExcerpt } from './search-excerpt';

/**
 * A long search result compacted to its opening and matching passages (see
 * {@link SearchExcerpt}). Rendered as text with marked matches, never as HTML.
 * Its own component so the styles stay out of the status card's, which is at
 * its size budget.
 */
@Component({
  selector: 'app-search-excerpt',
  imports: [MbButton, TranslocoPipe],
  templateUrl: './search-excerpt-view.html',
  styleUrl: './search-excerpt-view.css',
})
export class SearchExcerptView {
  readonly excerpt = input.required<SearchExcerpt>();
  /** The reader asked for the whole post. Carries the click so the card can stop it. */
  readonly expand = output<Event>();
}
