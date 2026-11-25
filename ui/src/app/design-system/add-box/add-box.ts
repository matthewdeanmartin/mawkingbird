import { Component, DestroyRef, ElementRef, inject, ViewEncapsulation } from '@angular/core';

/**
 * A field with its button attached: paste, search, jot. Project one `mb-field`
 * and one submit button into a native form.
 *
 * The button stays enabled while the box is empty, so a resting form does not
 * look broken; pressing it then puts the reader in the box and submits nothing.
 * Disable the button only while a request is running.
 */
@Component({
  selector: 'form[mbAddBox]',
  template: '<div class="mb-add-box"><ng-content /></div>',
  // The projected field and button take no scoped attributes; every selector
  // is namespaced to .mb-add-box.
  encapsulation: ViewEncapsulation.None,
  styleUrl: './add-box.css',
})
export class MbAddBox {
  constructor() {
    const host = inject<ElementRef<HTMLFormElement>>(ElementRef).nativeElement;
    // Capture: runs before ngSubmit, whichever order the directives were created in.
    const onSubmit = (event: Event) => {
      const box = host.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        '.mb-control',
      );
      if (!box || box.value.trim()) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      box.focus();
    };
    host.addEventListener('submit', onSubmit, { capture: true });
    inject(DestroyRef).onDestroy(() =>
      host.removeEventListener('submit', onSubmit, { capture: true }),
    );
  }
}
