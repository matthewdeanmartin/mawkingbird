import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { of, Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { translatedComputed, translatedMessage } from './translated';

/** A dictionary that arrives late, the way it does over HTTP in production. */
function lateDictionary() {
  const events = new Subject<{ type: string }>();
  const words: Record<string, string> = {};
  TestBed.configureTestingModule({
    providers: [
      {
        provide: TranslocoService,
        useValue: {
          events$: events,
          // The global test setup's preload; the late arrival below is the point.
          load: () => of({}),
          translate: (key: string, params?: Record<string, unknown>) =>
            words[key]?.replace('{{server}}', String(params?.['server'] ?? '')) ?? key,
        },
      },
    ],
  });
  return {
    arrive(entries: Record<string, string>) {
      Object.assign(words, entries);
      events.next({ type: 'translationLoadSuccess' });
    },
    changeLanguage(entries: Record<string, string>) {
      Object.keys(words).forEach((key) => delete words[key]);
      Object.assign(words, entries);
      events.next({ type: 'langChanged' });
    },
  };
}

describe('translatedComputed', () => {
  it('recomputes nested helper translations when the dictionary arrives', () => {
    const dictionary = lateDictionary();
    const server = signal('far.example');
    const label = TestBed.runInInjectionContext(() => {
      const transloco = inject(TranslocoService);
      const describe = () => transloco.translate('gone', { server: server() });
      return translatedComputed(() => ({ label: describe() }));
    });
    expect(label()).toEqual({ label: 'gone' });

    dictionary.arrive({ gone: '{{server}} did not return this post.' });
    expect(label()).toEqual({ label: 'far.example did not return this post.' });
    server.set('near.example');
    expect(label()).toEqual({ label: 'near.example did not return this post.' });
  });

  it('updates on live language changes without a data or input change', () => {
    const dictionary = lateDictionary();
    const label = TestBed.runInInjectionContext(() => {
      const transloco = inject(TranslocoService);
      return translatedComputed(() => transloco.translate('save'));
    });
    dictionary.arrive({ save: 'Save' });
    expect(label()).toBe('Save');
    dictionary.changeLanguage({ save: 'Speichern' });
    expect(label()).toBe('Speichern');
    dictionary.changeLanguage({});
    expect(label()).toBe('save');
    dictionary.arrive({ save: 'Salvează' });
    expect(label()).toBe('Salvează');
  });
});

describe('translatedMessage', () => {
  it('shows the words once they arrive, not the key it was set with', () => {
    const dictionary = lateDictionary();
    const message = TestBed.runInInjectionContext(() => translatedMessage());
    // A refused connection fails before i18n/en.json has loaded.
    message.set('pages.thread.error.loadPost');
    expect(message()).toBe('pages.thread.error.loadPost');

    dictionary.arrive({ 'pages.thread.error.loadPost': 'Could not load this post.' });
    expect(message()).toBe('Could not load this post.');
  });

  it('keeps its parameters and clears with null', () => {
    const dictionary = lateDictionary();
    const message = TestBed.runInInjectionContext(() => translatedMessage());
    dictionary.arrive({ gone: '{{server}} did not return this post.' });
    message.set('gone', { server: 'far.example' });
    expect(message()).toBe('far.example did not return this post.');
    message.set(null);
    expect(message()).toBeNull();
  });
});
import { inject, signal } from '@angular/core';
