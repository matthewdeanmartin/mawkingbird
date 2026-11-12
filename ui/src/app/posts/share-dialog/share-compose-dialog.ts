import { Component, computed, input, output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbDialog } from '../../design-system/dialog/dialog';
import { Status } from '../../platform/api/models';
import { Compose } from '../../publishing/compose/compose';
import { ComposeShareRequest, POST_TARGET_LABEL_KEYS } from './share-dialog';

// i18n shareCompose.title: Share to {{destination}}
// i18n shareCompose.close: Close

/**
 * The composer a cross-platform share opens: a new post of your own, prefilled
 * with a link to the shared one, in its own dialog.
 *
 * It used to open in the box under the post that Reply uses, which made a
 * share look like a reply. Like Quote, it is a fresh post to your own
 * audience, so it gets the same treatment.
 */
@Component({
  selector: 'app-share-compose-dialog',
  imports: [MbDialog, Compose, TranslocoPipe],
  template: `
    <mb-dialog
      size="wide"
      [title]="'shareCompose.title' | transloco: { destination: (destinationKey() | transloco) }"
      [closeLabel]="'shareCompose.close' | transloco"
      (dismissed)="closed.emit()"
    >
      <app-compose
        [initialText]="request().text"
        [initialTarget]="request().target"
        [gateable]="true"
        (posted)="posted.emit($event)"
      />
    </mb-dialog>
  `,
})
export class ShareComposeDialog {
  readonly request = input.required<ComposeShareRequest>();
  readonly posted = output<Status>();
  readonly closed = output<void>();

  protected readonly destinationKey = computed(() => POST_TARGET_LABEL_KEYS[this.request().target]);
}
