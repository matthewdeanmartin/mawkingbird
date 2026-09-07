import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslocoModule } from '@jsverse/transloco';
import { Annotation } from '../../../providers/read/reader-annotations';

// i18n reader.notes.title: Notes
// i18n reader.notes.moved: Passage moved
// i18n reader.notes.movedHint: The article changed, so this note is no longer shown in place.
// i18n reader.notes.onPage: page {{page}}
// i18n reader.notes.remove: Remove
// i18n reader.notes.share: Share
// i18n reader.notes.edit: Edit note
// i18n reader.notes.goTo: Go to this passage

/** One note as the rail shows it: the annotation plus where it landed. */
export interface RailNote {
  annotation: Annotation;
  /** 1-based page, or null when the anchor drifted and there is no place. */
  page: number | null;
  /** True when the quote no longer matches — see `reader-annotations.ts`. */
  moved: boolean;
}

/**
 * Notes beside the text.
 *
 * ## Why it is absent rather than empty
 *
 * Per the brief: the rail appears only when the document has at least one note.
 * An empty rail on every article is a permanent tax on the width of the page
 * for a feature most documents never use — and the reading measure is the point
 * of the whole reader.
 *
 * ## Why a drifted note is still shown
 *
 * When the publisher rewrites an article, an anchor can no longer be trusted to
 * point at the right sentence, so the highlight is not drawn. The *note* is
 * still the reader's own writing, and throwing it away because the page moved
 * would be destroying something they made over something they did not do. It
 * appears here marked "passage moved", with the quote it was made on.
 */
@Component({
  selector: 'app-notes-rail',
  standalone: true,
  imports: [TranslocoModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './notes-rail.html',
  styleUrl: './notes-rail.css',
})
export class NotesRail {
  readonly notes = input<readonly RailNote[]>([]);

  /** The page showing now, so its notes can be emphasised. */
  readonly currentPage = input(1);

  readonly goTo = output<RailNote>();
  readonly edit = output<RailNote>();
  readonly share = output<RailNote>();
  readonly remove = output<RailNote>();
}
