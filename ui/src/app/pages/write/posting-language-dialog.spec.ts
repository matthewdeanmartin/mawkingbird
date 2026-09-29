import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PostingLanguage } from '../../posting-language';
import { ClientPrefs } from '../../client-prefs';
import { PostingLanguageDialog } from './posting-language-dialog';

describe('PostingLanguageDialog', () => {
  const descriptors = ['showModal', 'close'].map(
    (name) => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)] as const,
  );
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    for (const [name] of descriptors)
      Object.defineProperty(HTMLDialogElement.prototype, name, {
        configurable: true,
        value() {
          this.open = name === 'showModal';
        },
      });
  });
  afterEach(() => {
    TestBed.resetTestingModule();
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>)[name];
    }
  });

  it('offers uncommon languages and accepts custom tags without truncating the script', async () => {
    const fixture = TestBed.createComponent(PostingLanguageDialog);
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const select = root.querySelector('select')!;
    expect(Array.from(select.options).map((option) => option.value)).toEqual(
      expect.arrayContaining(['zu', 'tlh', 'tok', 'other']),
    );
    select.value = 'other';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    const input = root.querySelector('input')!;
    input.value = 'zh-Hant';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    root.querySelector<HTMLButtonElement>('footer button')!.click();
    expect(TestBed.inject(PostingLanguage).default()).toBe('zh-Hant');
    expect(TestBed.inject(PostingLanguage).needsPrompt()).toBe(false);
  });

  it('allows another language for one post without replacing the default', async () => {
    TestBed.inject(PostingLanguage).choose('eo');
    const fixture = TestBed.createComponent(PostingLanguageDialog);
    fixture.componentRef.setInput('setDefault', false);
    const selected = vi.fn();
    fixture.componentInstance.selectedLanguage.subscribe(selected);
    await fixture.whenStable();
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    select.value = 'tlh';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.nativeElement.querySelector('footer button').click();
    expect(selected).toHaveBeenCalledWith('tlh');
    expect(TestBed.inject(ClientPrefs).postingLanguage()).toBe('eo');
  });

  it('remembers dismissal so the question is not asked on every visit', async () => {
    const fixture = TestBed.createComponent(PostingLanguageDialog);
    await fixture.whenStable();
    fixture.nativeElement
      .querySelector('dialog')
      .dispatchEvent(new Event('cancel', { cancelable: true }));
    expect(TestBed.inject(PostingLanguage).needsPrompt()).toBe(false);
  });
});
