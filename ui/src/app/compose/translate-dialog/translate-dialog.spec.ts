import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiTranslate } from '../../ai-translate';
import { ClientPrefs } from '../../client-prefs';
import { TranslateDialog, TranslateResult } from './translate-dialog';

describe('TranslateDialog', () => {
  let translateText: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    translateText = vi.fn().mockResolvedValue({
      text: 'Saluton al ĉiuj',
      model: 'test/model',
      target: 'Esperanto',
    });
    TestBed.configureTestingModule({
      imports: [TranslateDialog],
      providers: [{ provide: AiTranslate, useValue: { translateText } }],
    });
    TestBed.inject(ClientPrefs).setKnownLanguages(['eo']);
  });

  function setUp(post = 'Hello everyone'): ComponentFixture<TranslateDialog> {
    const fixture = TestBed.createComponent(TranslateDialog);
    fixture.componentRef.setInput('post', post);
    fixture.detectChanges();
    return fixture;
  }

  /** Reach the protected members the template drives. */
  function internals(fixture: ComponentFixture<TranslateDialog>) {
    return fixture.componentInstance as unknown as {
      target: { set(code: string): void };
      draft: { (): string; set(text: string): void };
      error(): string | null;
      apply(mode: 'replace' | 'append'): void;
    };
  }

  it('offers the languages the user knows first, so a second language is one click', () => {
    TestBed.inject(ClientPrefs).setKnownLanguages(['eo']);
    const fixture = setUp();
    const options = [...(fixture.nativeElement as HTMLElement).querySelectorAll('option')];
    expect(options[0].getAttribute('value')).toBe('eo');
    // The rest of the world is still reachable: you translate *out* of your
    // languages into someone else's.
    expect(options.length).toBeGreaterThan(5);
  });

  it('translates into the chosen language and shows the result for review', async () => {
    const fixture = setUp('Hello everyone');
    internals(fixture).target.set('eo');

    await fixture.componentInstance.run();
    fixture.detectChanges();

    expect(translateText).toHaveBeenCalledWith('Hello everyone', 'eo');
    const textarea = (fixture.nativeElement as HTMLElement).querySelector('textarea')!;
    expect((textarea as HTMLTextAreaElement).value).toBe('Saluton al ĉiuj');
  });

  it('emits replace or append with the target code, never applying on its own', async () => {
    const fixture = setUp();
    internals(fixture).target.set('eo');
    const seen: TranslateResult[] = [];
    fixture.componentInstance.applied.subscribe((r: TranslateResult) => seen.push(r));

    await fixture.componentInstance.run();
    // Nothing is emitted by translating — the user reads it first.
    expect(seen).toEqual([]);

    internals(fixture).apply('append');
    expect(seen).toEqual([{ text: 'Saluton al ĉiuj', mode: 'append', code: 'eo' }]);
  });

  it('reports a model failure instead of leaving the dialog blank', async () => {
    translateText.mockRejectedValue(new Error('Rate limited.'));
    const fixture = setUp();

    await fixture.componentInstance.run();
    fixture.detectChanges();

    expect(internals(fixture).error()).toBe('Rate limited.');
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.tr-error')!.textContent,
    ).toContain('Rate limited.');
  });

  it('does not call the model for an empty composer', async () => {
    const fixture = setUp('   ');
    await fixture.componentInstance.run();
    expect(translateText).not.toHaveBeenCalled();
  });
});
