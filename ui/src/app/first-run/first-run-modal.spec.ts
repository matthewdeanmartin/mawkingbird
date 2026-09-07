import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { FirstRunChoice, FirstRunModal } from './first-run-modal';

/** Click the button whose text contains `label`. */
function click(fixture: { nativeElement: HTMLElement }, label: string): void {
  const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((b) =>
    (b.textContent ?? '').toLowerCase().includes(label.toLowerCase()),
  );
  if (!button) {
    throw new Error(`no button matching "${label}"`);
  }
  button.click();
}

describe('FirstRunModal', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  function open(): {
    fixture: ReturnType<typeof TestBed.createComponent<FirstRunModal>>;
    chosen: FirstRunChoice[];
  } {
    const fixture = TestBed.createComponent(FirstRunModal);
    const chosen: FirstRunChoice[] = [];
    fixture.componentInstance.choose.subscribe((c) => chosen.push(c));
    fixture.detectChanges();
    return { fixture, chosen };
  }

  it('opens on the welcome step with both answers', () => {
    const { fixture } = open();
    const text = fixture.nativeElement.textContent ?? '';

    expect(text).toContain('Welcome to Mawkingbird');
    expect(text).toContain('Mastodon, Bluesky and more');
    expect(text.toLowerCase()).toContain('continue without logging in');
  });

  /**
   * Says out loud that the timeline behind the modal is a sample. Without it,
   * three seeded follows read as "this app picked who I follow".
   */
  it('tells the visitor the posts behind it are a sample', () => {
    const { fixture } = open();
    expect((fixture.nativeElement.textContent ?? '').toLowerCase()).toContain('sample');
  });

  it('answers anonymous directly from the welcome step', () => {
    const { fixture, chosen } = open();
    click(fixture, 'continue without logging in');

    expect(chosen).toEqual(['anonymous']);
  });

  it('asks which network only after Log in', () => {
    const { fixture, chosen } = open();
    expect(fixture.nativeElement.textContent).not.toContain('Which account');

    click(fixture, 'Log in');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Which account');
    // Step two is a question, not an answer: nothing is emitted yet.
    expect(chosen).toEqual([]);
  });

  it.each([
    ['Bluesky', 'bluesky'],
    ['Mastodon', 'mastodon'],
  ])('emits %s from the network step', (label, expected) => {
    const { fixture, chosen } = open();
    click(fixture, 'Log in');
    fixture.detectChanges();
    click(fixture, label);

    expect(chosen).toEqual([expected]);
  });

  it('goes back to the welcome step without answering', () => {
    const { fixture, chosen } = open();
    click(fixture, 'Log in');
    fixture.detectChanges();
    click(fixture, 'Back');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Welcome to Mawkingbird');
    expect(chosen).toEqual([]);
  });

  /**
   * The blocking contract. "Clicked the backdrop" has no honest reading as
   * either answer, so the backdrop must not be wired to anything — a stray
   * click cannot be allowed to mean "continue without logging in".
   */
  it('cannot be dismissed by the backdrop', () => {
    const { fixture, chosen } = open();
    const backdrop = fixture.nativeElement.querySelector('.first-run-backdrop') as HTMLElement;

    backdrop.click();
    fixture.detectChanges();

    expect(chosen).toEqual([]);
    expect(fixture.nativeElement.querySelector('.first-run-panel')).not.toBeNull();
  });

  it('has no close control of any kind', () => {
    const { fixture } = open();
    const labels = Array.from(
      fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>,
    ).map((b) => (b.textContent ?? '').trim().toLowerCase());

    expect(labels).not.toContain('×');
    expect(labels).not.toContain('close');
    expect(labels).not.toContain('cancel');
    expect(labels).not.toContain('skip');
  });

  it('is a labelled modal dialog', () => {
    const { fixture } = open();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.getAttribute('role')).toBe('dialog');
    expect(host.getAttribute('aria-modal')).toBe('true');
    expect(host.querySelector('#first-run-title')).not.toBeNull();
  });
});
