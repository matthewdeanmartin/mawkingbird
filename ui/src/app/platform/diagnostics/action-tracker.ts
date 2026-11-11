import { inject, Injectable } from '@angular/core';
import { sanitizePath } from './analytics-tracker';
import { DiagnosticLog } from './diagnostic-log';

const ACTIONABLE =
  'button, a, summary, [role="button"], [role="menuitem"], input[type="button"], input[type="submit"]';
const CONTROL = 'input, select, textarea';
const DYNAMIC_CLASS = /@|\d{4,}|^(active|disabled|ng-star-inserted|on|open|selected)$/i;

function elementTarget(target: EventTarget | null): Element | null {
  if (target instanceof Element) {
    return target;
  }
  return target instanceof Node ? target.parentElement : null;
}

function nearestComponent(element: Element): string | null {
  let current: Element | null = element;
  while (current) {
    const tag = current.tagName.toLowerCase();
    if (tag.startsWith('app-')) {
      return tag;
    }
    current = current.parentElement;
  }
  return null;
}

/** A stable target name made only from code-owned markup, never visible text or field values. */
export function actionTarget(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const type =
    element instanceof HTMLInputElement || element instanceof HTMLButtonElement
      ? element.type.toLowerCase()
      : '';
  const role = element.getAttribute('role') ?? '';
  const classes = [...element.classList]
    .filter((name) => /^[a-z][a-z0-9_-]{0,40}$/i.test(name) && !DYNAMIC_CLASS.test(name))
    .slice(0, 3);
  return [nearestComponent(element), tag, type || null, role || null, ...classes]
    .filter((part): part is string => !!part)
    .join(' > ');
}

/**
 * Application-boundary capture of low-frequency, committed user actions.
 *
 * No mouse movement, scrolling, focus, hover, keystrokes, input events, visible
 * labels, field values, ids, or external destinations are recorded. This is an
 * intent timeline: explicit page diagnostics still describe workflow outcomes.
 */
@Injectable({ providedIn: 'root' })
export class ActionTracker {
  private readonly log = inject(DiagnosticLog);
  private started = false;

  start(): void {
    if (this.started || typeof document === 'undefined') {
      return;
    }
    this.started = true;
    document.addEventListener('click', (event) => this.onClick(event), true);
    document.addEventListener('submit', (event) => this.onSubmit(event), true);
    document.addEventListener('change', (event) => this.onChange(event), true);
  }

  private onClick(event: MouseEvent): void {
    if (!event.isTrusted) {
      return;
    }
    const target = elementTarget(event.target)?.closest(ACTIONABLE);
    if (!target) {
      return;
    }
    // Submit buttons are represented by the form's submit event, avoiding a duplicate pair.
    if (
      (target instanceof HTMLButtonElement || target instanceof HTMLInputElement) &&
      target.type.toLowerCase() === 'submit' &&
      target.closest('form')
    ) {
      return;
    }
    const details: Record<string, unknown> = this.details(target);
    if (target instanceof HTMLAnchorElement) {
      const destination = this.internalDestination(target);
      details['destination'] = destination ?? 'external';
    }
    this.log.write('info', 'Mockingbird Action', 'user:activate', details);
  }

  private onSubmit(event: SubmitEvent): void {
    if (!event.isTrusted) {
      return;
    }
    const form = elementTarget(event.target)?.closest('form');
    if (form) {
      this.log.write('info', 'Mockingbird Action', 'user:submit', this.details(form));
    }
  }

  private onChange(event: Event): void {
    if (!event.isTrusted) {
      return;
    }
    const control = elementTarget(event.target)?.closest(CONTROL);
    if (!control) {
      return;
    }
    const details: Record<string, unknown> = this.details(control);
    if (control instanceof HTMLInputElement && ['checkbox', 'radio'].includes(control.type)) {
      details['checked'] = control.checked;
    }
    this.log.write('info', 'Mockingbird Action', 'user:change', details);
  }

  private details(element: Element): Record<string, unknown> {
    return {
      route: sanitizePath(location.pathname),
      target: actionTarget(element),
    };
  }

  private internalDestination(anchor: HTMLAnchorElement): string | null {
    try {
      const url = new URL(anchor.href, location.href);
      return url.origin === location.origin ? sanitizePath(url.pathname) : null;
    } catch {
      return null;
    }
  }
}
