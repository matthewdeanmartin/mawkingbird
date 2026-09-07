import { Directive, ElementRef, OnDestroy, inject, input, output } from '@angular/core';

/**
 * Focusable descendants, in document order.
 *
 * `:not([tabindex="-1"])` keeps out programmatic-only targets (the routed
 * <main>, dialog containers). Hidden elements are filtered separately, in
 * `isHidden` — collapsed panels inside a dialog would otherwise be Tab stops
 * leading nowhere visible.
 */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'details > summary',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Makes a modal behave like one for keyboard and screen-reader users.
 *
 * The dialogs in this app already carry `role="dialog"` and `aria-modal`, but
 * nothing enforced the behaviour those attributes promise: focus stayed behind
 * the dialog on open, Tab wandered out into the page underneath, and closing
 * dropped focus to <body> — which sends a screen reader back to the top of the
 * document. `aria-modal="true"` also tells the screen reader the rest of the
 * page is inert, so without a trap the markup was actively lying.
 *
 * Applied to the dialog element itself (not the backdrop) so it works with
 * every shape used here: backdrop-wrapped, sibling-backdrop, and bare section.
 *
 *   <div class="dialog" role="dialog" appFocusTrap (dismissed)="closed.emit()">
 *
 * Escape is handled at the document level rather than via a `(keyup.escape)`
 * on the container, which only fires when focus is already inside.
 */
@Directive({
  selector: '[appFocusTrap]',
})
export class FocusTrap implements OnDestroy {
  private readonly host = inject(ElementRef<HTMLElement>);

  /** Set false for a dialog that must be dismissed by an explicit choice. */
  readonly closeOnEscape = input(true, { alias: 'appFocusTrapCloseOnEscape' });

  /** Escape was pressed. The host still owns the decision to close. */
  readonly dismissed = output<void>();

  /**
   * Whatever had focus when the dialog opened — nearly always the control that
   * opened it, which is exactly where focus belongs again afterwards.
   */
  private readonly opener = document.activeElement as HTMLElement | null;

  constructor() {
    document.addEventListener('keydown', this.onKeydown, true);
    // The dialog's content is rendered by the time the directive constructs,
    // but a child component's own view may not be; defer so the first
    // focusable element of a composed dialog is found.
    setTimeout(() => this.focusFirst());
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.onKeydown, true);
    // Only restore if focus is still inside the dialog (or was lost to body).
    // If something else has deliberately taken focus — a confirm dialog that
    // opened a second one, say — leave it alone.
    const active = document.activeElement;
    const stillOurs = !active || active === document.body || this.element.contains(active);
    if (stillOurs && this.opener?.isConnected) {
      this.opener.focus({ preventScroll: true });
    }
  }

  private get element(): HTMLElement {
    return this.host.nativeElement;
  }

  /**
   * Hidden here means "explicitly hidden", not "has no box".
   *
   * An offsetWidth/offsetHeight test looks like the obvious visibility check
   * but is wrong in any context without layout — jsdom reports 0 for every
   * element, which would empty the list and disable the trap entirely under
   * test. These attribute/style checks are what actually distinguishes a
   * collapsed panel from a perfectly visible button.
   */
  private isHidden(el: HTMLElement): boolean {
    if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return true;
    if (el.closest('[hidden],[aria-hidden="true"]')) return true;
    const style = getComputedStyle(el);
    return style.display === 'none' || style.visibility === 'hidden';
  }

  private focusable(): HTMLElement[] {
    return (
      Array.from(this.element.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => !this.isHidden(el))
        // querySelectorAll with a comma-separated selector does not reliably
        // return document order — some engines group results by clause, so a
        // dialog of <button><input><button> comes back button,button,input.
        // "First" and "last" are meaningless until this is sorted, and Tab
        // would wrap to the wrong end.
        .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    );
  }

  private focusFirst(): void {
    const first = this.focusable()[0];
    if (first) {
      first.focus({ preventScroll: true });
      return;
    }
    // A dialog with nothing focusable (a loading state, say) still needs to
    // take focus so its label is announced and Escape reaches us.
    if (!this.element.hasAttribute('tabindex')) {
      this.element.setAttribute('tabindex', '-1');
    }
    this.element.focus({ preventScroll: true });
  }

  /**
   * Capture-phase so the trap sees Tab/Escape before any component handler
   * that might stop propagation on its way up.
   */
  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.closeOnEscape()) {
      event.preventDefault();
      this.dismissed.emit();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const items = this.focusable();
    if (!items.length) {
      // Nothing to cycle between; keep focus on the dialog rather than
      // letting Tab escape into the page behind it.
      event.preventDefault();
      return;
    }

    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement as HTMLElement | null;

    // Focus can sit on the dialog container itself (focusFirst fallback), or
    // have escaped entirely; either way Tab should re-enter at an end.
    if (!active || !this.element.contains(active) || active === this.element) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
      return;
    }

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };
}
