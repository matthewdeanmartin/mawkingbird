import { HttpParams, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserList } from '../models';
import { ListSettingsDialog } from './list-settings-dialog';

describe('ListSettingsDialog', () => {
  let http: HttpTestingController;
  const modalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');

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

  async function setUp(list: UserList): Promise<ComponentFixture<ListSettingsDialog>> {
    const fixture = TestBed.createComponent(ListSettingsDialog);
    fixture.componentRef.setInput('list', list);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('renames a list and changes its reply policy without resetting exclusivity', async () => {
    const f = await setUp({ id: '5', title: 'Friends', exclusive: true, replies_policy: 'list' });
    const el = f.nativeElement as HTMLElement;
    const name = el.querySelector<HTMLInputElement>('input[type="text"]')!;
    expect(name.value).toBe('Friends');
    name.value = '  Close friends ';
    name.dispatchEvent(new Event('input'));
    const radios = el.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    expect(Array.from(radios).map((r) => r.value)).toEqual(['list', 'followed', 'none']);
    expect(radios[0].checked).toBe(true);
    radios[2].click();
    f.detectChanges();

    const saved = vi.fn();
    f.componentInstance.saved.subscribe(saved);
    f.componentInstance.save();
    const request = http.expectOne('/api/v1/lists/5');
    expect(request.request.method).toBe('PUT');
    const body = request.request.body as HttpParams;
    expect(body.get('title')).toBe('Close friends');
    expect(body.get('replies_policy')).toBe('none');
    expect(body.get('exclusive')).toBe('true');
    const updated = { id: '5', title: 'Close friends', exclusive: true, replies_policy: 'none' };
    request.flush(updated);
    expect(saved).toHaveBeenCalledWith(updated);
  });

  it('refuses an empty name and keeps edits after a server failure', async () => {
    const f = await setUp({ id: '5', title: 'Friends', replies_policy: 'followed' });
    const el = f.nativeElement as HTMLElement;
    const name = el.querySelector<HTMLInputElement>('input[type="text"]')!;
    name.value = '   ';
    name.dispatchEvent(new Event('input'));
    f.componentInstance.save();
    f.detectChanges();
    expect(el.textContent).toContain('A list needs a name.');
    http.expectNone('/api/v1/lists/5');

    name.value = 'Pals';
    name.dispatchEvent(new Event('input'));
    f.componentInstance.save();
    http
      .expectOne('/api/v1/lists/5')
      .flush(null, { status: 422, statusText: 'Unprocessable Entity' });
    f.detectChanges();
    expect(el.querySelector('mb-notice [role="alert"]')?.textContent).toContain(
      'Could not save this list.',
    );
    expect(name.value).toBe('Pals');
  });
});
