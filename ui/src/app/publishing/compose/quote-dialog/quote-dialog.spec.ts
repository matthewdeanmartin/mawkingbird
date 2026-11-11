import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Account, Status } from '../../../platform/api/models';
import { QuoteDialog } from './quote-dialog';

function quoted(overrides: Partial<Status> = {}): Status {
  return {
    id: 'q1',
    provider: 'mastodon',
    content: '<p>The original <b>post</b></p>',
    spoiler_text: '',
    account: {
      id: 'a1',
      username: 'author',
      acct: 'author@example.social',
      display_name: 'The Author',
      avatar_static: '',
    } as Account,
    media_attachments: [],
    ...overrides,
  } as unknown as Status;
}

describe('QuoteDialog', () => {
  const modal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');

  beforeEach(() => {
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value() {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value() {
        this.open = false;
      },
    });
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    for (const [name, descriptor] of [
      ['showModal', modal],
      ['close', close],
    ] as const) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>)[name];
    }
    vi.restoreAllMocks();
  });

  function setUp(status: Status): ComponentFixture<QuoteDialog> {
    const fixture = TestBed.createComponent(QuoteDialog);
    fixture.componentRef.setInput('status', status);
    fixture.detectChanges();
    return fixture;
  }

  it('puts your text box first and the quoted post below it', () => {
    const element = setUp(quoted()).nativeElement as HTMLElement;
    const compose = element.querySelector('app-compose');
    const preview = element.querySelector('app-quote-preview');
    expect(compose).not.toBeNull();
    expect(preview?.textContent).toContain('The original post');
    expect(preview?.textContent).toContain('@author@example.social');
    // Document order: the composer comes before the preview.
    expect(compose!.compareDocumentPosition(preview!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('offers Fullscreen edit beside Post for a Mastodon quote', () => {
    const element = setUp(quoted()).nativeElement as HTMLElement;
    const labels = [...element.querySelectorAll('app-compose button')].map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).toContain('Fullscreen edit');
  });

  it('explains a refused quote up front instead of offering a composer', () => {
    const element = setUp(quoted({ quote_approval: { current_user: 'denied' } }))
      .nativeElement as HTMLElement;
    expect(element.querySelector('app-compose')).toBeNull();
    expect(element.textContent).toContain('does not allow this post to be quoted');
    expect(element.querySelector('app-quote-preview')).not.toBeNull();
  });

  it('says when the author reviews quotes first', () => {
    const element = setUp(quoted({ quote_approval: { current_user: 'manual' } }))
      .nativeElement as HTMLElement;
    expect(element.textContent).toContain('The author reviews quotes');
    expect(element.querySelector('app-compose')).not.toBeNull();
  });

  it('closes when dismissed', () => {
    const fixture = setUp(quoted());
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    const close = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Close',
    );
    close!.click();
    expect(closed).toHaveBeenCalled();
  });
});
