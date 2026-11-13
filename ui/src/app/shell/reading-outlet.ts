import { DestroyRef, Directive, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ReadingHistory, ReadingLifecycle } from './reading-history';

/** Detaching is not destruction: explicitly suspend work owned by a hidden page. */
@Directive({ selector: 'router-outlet[mbReadingOutlet]' })
export class ReadingOutlet {
  constructor() {
    const outlet = inject(RouterOutlet);
    const history = inject(ReadingHistory);
    const detached = outlet.detachEvents.subscribe((page: ReadingLifecycle) =>
      page.suspendReading?.(),
    );
    const attached = outlet.attachEvents.subscribe((page: ReadingLifecycle) => {
      history.attached();
      page.resumeReading?.();
    });
    inject(DestroyRef).onDestroy(() => {
      detached.unsubscribe();
      attached.unsubscribe();
    });
  }
}
