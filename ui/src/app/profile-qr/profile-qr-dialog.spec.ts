import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProfileQrDialog } from './profile-qr-dialog';

describe('ProfileQrDialog', () => {
  let http: HttpTestingController;
  const modalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');

  beforeEach(() => {
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
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    for (const [name, descriptor] of [
      ['showModal', modalDescriptor],
      ['close', closeDescriptor],
    ] as const) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>)[name];
    }
    http.verify();
  });

  it('renders a scannable image of the profile URL with the link as text', async () => {
    const fixture = TestBed.createComponent(ProfileQrDialog);
    fixture.componentRef.setInput('url', 'https://example.social/@alice');
    fixture.componentRef.setInput('acct', 'alice');
    fixture.detectChanges();
    await fixture.componentInstance.ngOnInit();
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const img = el.querySelector<HTMLImageElement>('.qr img')!;
    expect(img.getAttribute('src')).toMatch(/^data:image\/gif;base64,/);
    expect(img.alt).toContain('https://example.social/@alice');
    expect(el.querySelector('.qr-url')?.textContent).toBe('https://example.social/@alice');
  });
});
