import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { of, Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { translatedMessage } from './translated';

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
  };
}

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
