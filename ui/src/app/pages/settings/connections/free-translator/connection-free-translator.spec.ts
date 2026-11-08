import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FreeTranslators } from '../../../../translation/free-translators';
import { TranslationConnectors } from '../../../../translation/translation-connectors';
import { ConnectionFreeTranslator } from './connection-free-translator';

describe('ConnectionFreeTranslator', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => vi.restoreAllMocks());

  function render(translator: 'mymemory' | 'apertium') {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { translator } } } },
      ],
    });
    const fixture = TestBed.createComponent(ConnectionFreeTranslator);
    fixture.detectChanges();
    return fixture;
  }

  it('MyMemory: says what is sent where, switches on, and saves an email', async () => {
    const f = render('mymemory');
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.textContent).toContain('api.mymemory.translated.net');
    const box = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(box.checked).toBe(false);
    box.click();
    expect(TestBed.inject(TranslationConnectors).myMemoryEnabled()).toBe(true);
    const email = el.querySelector('input[type="email"]') as HTMLInputElement;
    email.value = 'me@example.org';
    email.dispatchEvent(new Event('input'));
    (el.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    f.detectChanges();
    expect(TestBed.inject(TranslationConnectors).myMemoryEmail()).toBe('me@example.org');
  });

  it('Apertium: has no email field, links its pair list, and runs a test translation', async () => {
    const f = render('apertium');
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('input[type="email"]')).toBeNull();
    expect(el.textContent).toContain('apertium.org');
    const call = vi
      .spyOn(TestBed.inject(FreeTranslators), 'apertium')
      .mockResolvedValue('Hello world');
    const test = [...el.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Test it'),
    )!;
    test.click();
    await vi.waitFor(() => {
      f.detectChanges();
      expect(el.textContent).toContain('It works');
    });
    expect(call).toHaveBeenCalledWith('Hola mundo', 'spa|eng');
  });
});
