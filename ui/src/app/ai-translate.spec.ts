import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AiTranslate, htmlToPlainText, languageName } from './ai-translate';
import { ClientPrefs } from './client-prefs';
import { OpenRouterChat } from './providers/openrouter/openrouter-chat';
import { OpenRouterModelChoice } from './providers/openrouter/openrouter-model-choice';

describe('htmlToPlainText', () => {
  it('strips tags, which the model should never be asked to translate', () => {
    expect(htmlToPlainText('<p>Hello <a href="https://x.example">world</a></p>')).toBe(
      'Hello world',
    );
  });

  it('turns block boundaries into blank lines instead of fusing words together', () => {
    // Without this, "one" and "two" arrive as "onetwo".
    expect(htmlToPlainText('<p>one</p><p>two</p>')).toBe('one\n\ntwo');
  });

  it('keeps line breaks', () => {
    expect(htmlToPlainText('a<br>b')).toBe('a\nb');
  });

  it('decodes entities so the model sees real characters', () => {
    expect(htmlToPlainText('<p>caf&eacute; &amp; bar</p>')).toBe('café & bar');
  });

  it('collapses runaway blank lines', () => {
    expect(htmlToPlainText('<p>a</p><p></p><p></p><p>b</p>')).toBe('a\n\nb');
  });

  it('leaves handles and hashtags intact for the prompt to protect', () => {
    expect(htmlToPlainText('<p>hi <span>@bob@x.example</span> #Rust</p>')).toBe(
      'hi @bob@x.example #Rust',
    );
  });
});

describe('languageName', () => {
  it('names the codes the app offers', () => {
    expect(languageName('en')).toBe('English');
    expect(languageName('ja')).toBe('Japanese');
  });

  it('handles a full locale', () => {
    expect(languageName('pt-BR')).toBe('Portuguese');
    expect(languageName('EN_US')).toBe('English');
  });

  it('falls back to the code itself rather than guessing or defaulting to English', () => {
    expect(languageName('cy')).toBe('CY');
  });
});

describe('AiTranslate', () => {
  let complete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    complete = vi.fn().mockResolvedValue('El gato se sentó.');
    TestBed.configureTestingModule({
      providers: [{ provide: OpenRouterChat, useValue: { complete } }],
    });
  });

  function service(): AiTranslate {
    return TestBed.inject(AiTranslate);
  }

  it('translates a post body and reports which model did it', async () => {
    TestBed.inject(ClientPrefs).knownLanguages.set(['es']);

    const result = await service().translateHtml('<p>The cat sat.</p>');

    expect(result.text).toBe('El gato se sentó.');
    expect(result.target).toBe('Spanish');
    expect(result.model).toBe(TestBed.inject(OpenRouterModelChoice).modelId());
  });

  it('sends the plain text and the target language into the prompt', async () => {
    TestBed.inject(ClientPrefs).knownLanguages.set(['de']);

    await service().translateHtml('<p>The cat sat.</p>');

    const { prompt, source } = complete.mock.calls[0][0];
    expect(prompt).toContain('The cat sat.');
    expect(prompt).toContain('German');
    // No tags reach the model.
    expect(prompt).not.toContain('<p>');
    // The source is handed over so the guard can sanity-check the reply's length.
    expect(source).toBe('The cat sat.');
  });

  it("targets the first known language, which is the app's statement of what you read", async () => {
    TestBed.inject(ClientPrefs).knownLanguages.set(['fr', 'en']);

    expect(service().targetLanguage()).toBe('fr');
  });

  it('falls back to the browser locale rather than assuming English', async () => {
    // An app that hardcodes English as the destination is the reason this feature
    // is worth having.
    TestBed.inject(ClientPrefs).knownLanguages.set([]);
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('ja-JP');

    expect(service().targetLanguage()).toBe('ja');
  });

  it('refuses an empty post without spending a request', async () => {
    await expect(service().translateHtml('<p>   </p>')).rejects.toThrow(/nothing to translate/i);
    expect(complete).not.toHaveBeenCalled();
  });

  it('lets an OpenRouter failure through with its own wording', async () => {
    // The credits/rate-limit messages are already actionable; wrapping them in a
    // generic "translation failed" would throw away the useful part.
    complete.mockRejectedValue(new Error('Your OpenRouter credits have run out.'));

    await expect(service().translateText('hola')).rejects.toThrow(/credits have run out/i);
  });
});
