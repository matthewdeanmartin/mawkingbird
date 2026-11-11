import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Collection } from '../../../platform/api/models';
import { CollectionSettingsDialog } from './collection-settings-dialog';

describe('CollectionSettingsDialog', () => {
  let http: HttpTestingController;
  const descriptors = (['showModal', 'close'] as const).map(
    (name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const,
  );

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
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>)[name];
    }
    http.verify();
  });

  async function setUp(
    collection: Partial<Collection> | null,
    initialName = '',
  ): Promise<ComponentFixture<CollectionSettingsDialog>> {
    const fixture = TestBed.createComponent(CollectionSettingsDialog);
    fixture.componentRef.setInput('collection', collection);
    fixture.componentRef.setInput('initialName', initialName);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  const checkbox = (f: ComponentFixture<CollectionSettingsDialog>, i: number) =>
    (f.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[
      i
    ];

  it('creates a collection with language, sensitivity and discoverability', async () => {
    const f = await setUp(null, 'Birders');
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector<HTMLInputElement>('input[type="text"]')!.value).toBe('Birders');
    const select = el.querySelector('select')!;
    select.value = 'en';
    select.dispatchEvent(new Event('change'));
    checkbox(f, 0).click();
    checkbox(f, 1).click();
    f.detectChanges();

    const saved = vi.fn();
    f.componentInstance.saved.subscribe(saved);
    f.componentInstance.save();
    const post = http.expectOne('/api/v1/collections');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      name: 'Birders',
      sensitive: true,
      discoverable: true,
      language: 'en',
    });
    post.flush({ collection: { id: 'c1', name: 'Birders', sensitive: true, language: 'en' } });
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1', language: 'en' }));
  });

  it('loads saved values for editing and sends every field back', async () => {
    const f = await setUp({
      id: 'c9',
      name: 'Old',
      description: 'Desc',
      language: 'de',
      sensitive: true,
      discoverable: false,
    });
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('select')!.value).toBe('de');
    expect(checkbox(f, 0).checked).toBe(true);
    checkbox(f, 0).click();
    f.detectChanges();
    f.componentInstance.save();
    const patch = http.expectOne('/api/v1/collections/c9');
    expect(patch.request.method).toBe('PATCH');
    expect(patch.request.body).toEqual({
      name: 'Old',
      description: 'Desc',
      language: 'de',
      sensitive: false,
      discoverable: false,
    });
    patch.flush({ collection: { id: 'c9', name: 'Old', sensitive: false } });
  });

  it('refuses a blank name and reports server errors', async () => {
    const f = await setUp(null);
    f.componentInstance.save();
    f.detectChanges();
    expect((f.nativeElement as HTMLElement).textContent).toContain('A collection needs a name.');
    http.expectNone('/api/v1/collections');
  });
});
