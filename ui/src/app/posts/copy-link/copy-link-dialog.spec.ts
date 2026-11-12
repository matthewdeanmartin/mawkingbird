import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CopyLinkDialog } from './copy-link-dialog';

describe('CopyLinkDialog', () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  const modalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');

  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    for (const [name, open] of [
      ['showModal', true],
      ['close', false],
    ] as const) {
      Object.defineProperty(HTMLDialogElement.prototype, name, {
        configurable: true,
        value() {
          this.open = open;
        },
      });
    }
  });

  afterEach(() => {
    writeText.mockClear();
    TestBed.resetTestingModule();
    for (const [name, descriptor] of [
      ['showModal', modalDescriptor],
      ['close', closeDescriptor],
    ] as const) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>)[name];
    }
  });

  function render(inputs: {
    postLabel?: string;
    postUrl?: string | null;
    accountUrl?: string | null;
  }) {
    const fixture = TestBed.createComponent(CopyLinkDialog);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('shows the post in the reader’s word for it, and its author', () => {
    const el = render({
      postLabel: 'Tweet',
      postUrl: 'https://mawkingbird.com/a.example/@a@a.example/1',
      accountUrl: 'https://mawkingbird.com/@a@a.example',
    });
    const labels = [...el.querySelectorAll('.row-label')].map((n) => n.textContent?.trim());
    expect(labels).toEqual(['Tweet', 'Account']);
    const values = [...el.querySelectorAll('input')].map((n) => n.value);
    expect(values).toEqual([
      'https://mawkingbird.com/a.example/@a@a.example/1',
      'https://mawkingbird.com/@a@a.example',
    ]);
  });

  it('copies the row whose button was pressed', async () => {
    const el = render({ postLabel: 'Post', postUrl: 'https://p', accountUrl: 'https://a' });
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('.rows button')];
    buttons[1].click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('https://a');
  });

  it('leaves out a row with no link, as on a profile page', () => {
    const el = render({ accountUrl: 'https://a' });
    expect(el.querySelectorAll('input').length).toBe(1);
  });
});
