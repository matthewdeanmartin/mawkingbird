import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { FocusTrap } from './focus-trap';

/**
 * The behaviour `role="dialog"` + `aria-modal` promise but do not enforce.
 *
 * The property under test throughout: while a modal is open, focus is inside
 * it, and when it closes focus goes back where it came from. Without that,
 * `aria-modal="true"` tells a screen reader the rest of the page is inert while
 * Tab happily walks into it — the markup and the behaviour disagree.
 */
@Component({
  imports: [FocusTrap],
  template: `
    <button id="opener" type="button">Open</button>
    <button id="outside" type="button">Outside</button>
    @if (open()) {
      <div role="dialog" appFocusTrap (dismissed)="open.set(false)">
        <button id="first" type="button">First</button>
        <input id="middle" />
        <button id="last" type="button">Last</button>
      </div>
    }
  `,
})
class Host {
  readonly open = signal(false);
}

describe('FocusTrap', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Host] });
    fixture = TestBed.createComponent(Host);
    // Attach to the live document: focus() is a no-op on a detached tree.
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    host = fixture.componentInstance;
  });

  function el<T extends HTMLElement>(id: string): T {
    return fixture.nativeElement.querySelector(`#${id}`) as T;
  }

  function open(): void {
    el('opener').focus();
    host.open.set(true);
    fixture.detectChanges();
  }

  function tab(shiftKey = false): void {
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true }),
    );
    fixture.detectChanges();
  }

  it('moves focus into the dialog when it opens', async () => {
    open();
    // focusFirst defers a tick so composed dialogs have rendered.
    await new Promise((r) => setTimeout(r));
    expect(document.activeElement).toBe(el('first'));
  });

  it('cycles from the last control back to the first', async () => {
    open();
    await new Promise((r) => setTimeout(r));
    el<HTMLButtonElement>('last').focus();
    tab();
    expect(document.activeElement).toBe(el('first'));
  });

  it('cycles backwards from the first control to the last', async () => {
    open();
    await new Promise((r) => setTimeout(r));
    el<HTMLButtonElement>('first').focus();
    tab(true);
    expect(document.activeElement).toBe(el('last'));
  });

  it('pulls focus back when it has escaped the dialog', async () => {
    open();
    await new Promise((r) => setTimeout(r));
    // Something outside stole focus (a stray click, an autofocusing widget).
    el<HTMLButtonElement>('outside').focus();
    tab();
    expect(document.activeElement).toBe(el('first'));
  });

  it('emits dismissed on Escape from anywhere, not just inside', () => {
    open();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();
    expect(host.open()).toBe(false);
  });

  it('restores focus to the opener when it closes', async () => {
    open();
    await new Promise((r) => setTimeout(r));
    expect(document.activeElement).not.toBe(el('opener'));

    host.open.set(false);
    fixture.detectChanges();

    expect(document.activeElement).toBe(el('opener'));
  });
});
