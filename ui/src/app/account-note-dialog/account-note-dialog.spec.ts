import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountNoteDialog } from './account-note-dialog';

describe('AccountNoteDialog', () => {
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
      providers: [provideHttpClient(), provideHttpClientTesting()],
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

  async function setUp(initial = ''): Promise<ComponentFixture<AccountNoteDialog>> {
    const fixture = TestBed.createComponent(AccountNoteDialog);
    fixture.componentRef.setInput('accountId', '42');
    fixture.componentRef.setInput('acct', 'them@remote.example');
    fixture.componentRef.setInput('initial', initial);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  function buttons(f: ComponentFixture<AccountNoteDialog>): HTMLButtonElement[] {
    return Array.from((f.nativeElement as HTMLElement).querySelectorAll('button'));
  }

  it('creates a note on the server and reports the new relationship', async () => {
    const f = await setUp();
    const el = f.nativeElement as HTMLElement;
    expect(buttons(f).some((b) => b.textContent?.includes('Delete note'))).toBe(false);
    const area = el.querySelector('textarea')!;
    area.value = '  Met at FOSDEM  ';
    area.dispatchEvent(new Event('input'));
    f.detectChanges();
    const saved = vi.fn();
    f.componentInstance.saved.subscribe(saved);
    buttons(f)
      .find((b) => b.textContent?.includes('Save note'))!
      .click();
    const request = http.expectOne('/api/v1/accounts/42/note');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ comment: 'Met at FOSDEM' });
    request.flush({ id: '42', note: 'Met at FOSDEM' });
    expect(saved).toHaveBeenCalledWith({ id: '42', note: 'Met at FOSDEM' });
  });

  it('edits an existing note and can clear it', async () => {
    const f = await setUp('Old note');
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('textarea')!.value).toBe('Old note');
    const save = buttons(f).find((b) => b.textContent?.includes('Save note'))!;
    expect(save.disabled).toBe(true);
    buttons(f)
      .find((b) => b.textContent?.includes('Delete note'))!
      .click();
    const request = http.expectOne('/api/v1/accounts/42/note');
    expect(request.request.body).toEqual({ comment: '' });
    request.flush({ id: '42', note: '' });
  });

  it('keeps the typed note and shows an error when saving fails', async () => {
    const f = await setUp();
    const el = f.nativeElement as HTMLElement;
    const area = el.querySelector('textarea')!;
    area.value = 'Keep me';
    area.dispatchEvent(new Event('input'));
    f.detectChanges();
    f.componentInstance.save('Keep me');
    http
      .expectOne('/api/v1/accounts/42/note')
      .flush(null, { status: 500, statusText: 'Server Error' });
    f.detectChanges();
    expect(el.querySelector('mb-notice [role="alert"]')?.textContent).toContain(
      'Could not save this note.',
    );
    expect(area.value).toBe('Keep me');
  });
});
