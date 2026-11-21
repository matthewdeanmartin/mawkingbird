import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Lightbox } from './lightbox';
import { MediaAttachment, Status } from '../../platform/api/models';
import { TranslationRouter } from '../../translation/translation-router';
import { OpenRouterSession } from '../../connections/openrouter/openrouter-session';
import { AiAvailability } from '../../platform/build/ai-availability';

describe('Lightbox: translating an image description on request', () => {
  let translate: ReturnType<typeof vi.fn>;
  const image = {
    id: 'm1',
    type: 'image',
    url: 'https://example.test/a.jpg',
    preview_url: 'https://example.test/a-small.jpg',
    description: 'Ein Hund <am> Strand',
  } as MediaAttachment;

  beforeEach(() => {
    translate = vi.fn(async () => ({
      kind: 'text',
      text: 'A dog on the beach',
      engine: 'mymemory',
      source: 'de',
      target: 'en',
    }));
    TestBed.configureTestingModule({
      providers: [
        { provide: TranslationRouter, useValue: { translate } },
        { provide: OpenRouterSession, useValue: { ready: () => false } },
        { provide: AiAvailability, useValue: { enabled: () => false } },
      ],
    });
  });

  function render() {
    const fixture = TestBed.createComponent(Lightbox);
    fixture.componentRef.setInput('items', [image]);
    fixture.componentRef.setInput('context', {
      status: { id: 's1', language: 'de' } as Status,
      server: 'https://mastodon.example',
    });
    fixture.detectChanges();
    return fixture;
  }

  const button = (el: HTMLElement) =>
    [...el.querySelectorAll('button')].find((b) =>
      /Translate description|Show the original/.test(b.textContent ?? ''),
    )!;

  it('sends only that description, never through the server, and shows the result', async () => {
    const fixture = render();
    const el = fixture.nativeElement as HTMLElement;
    button(el).click();
    await fixture.whenStable();
    fixture.detectChanges();

    const request = translate.mock.calls[0][0];
    expect(request.serverCanTranslate).toBe(false);
    expect(request.status.content).toBe('<p>Ein Hund &lt;am&gt; Strand</p>');
    expect(request.status.language).toBe('de');
    expect(request.status.media_attachments).toEqual([]);
    expect(el.querySelector('.lightbox-caption')?.textContent).toContain('A dog on the beach');

    button(el).click();
    fixture.detectChanges();
    expect(el.querySelector('.lightbox-caption')?.textContent).toContain('Ein Hund <am> Strand');
  });

  it('says so when the description is already in the reader’s language', async () => {
    translate.mockResolvedValue({ kind: 'same', language: 'en' });
    const fixture = render();
    button(fixture.nativeElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'already in your language',
    );
  });
});
