import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Account } from '../../../platform/api/models';
import { TranslationRouter } from '../../../translation/translation-router';
import { BioTranslation, bioAsStatus } from './bio-translation';

const account = {
  id: '9',
  username: 'lea',
  acct: 'lea@example.de',
  url: 'https://example.de/@lea',
  note: '<p>Ich fotografiere Vögel am Rhein.</p>',
  fields: [
    { name: 'Wohnort', value: 'Köln' },
    { name: '', value: '' },
  ],
  emojis: [],
} as unknown as Account;

describe('bioAsStatus', () => {
  it('carries the bio and each non-empty field as its own line', () => {
    const status = bioAsStatus(account);
    expect(status.id).toBe('profile-bio:9');
    expect(status.uri).toBe('https://example.de/@lea#bio');
    expect(status.content).toBe('<p>Ich fotografiere Vögel am Rhein.</p><p>Wohnort: Köln</p>');
    expect(status.language).toBeNull();
  });
});

describe('BioTranslation', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setUp(translate: ReturnType<typeof vi.fn>): ComponentFixture<BioTranslation> {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TranslationRouter, useValue: { translate } },
      ],
    });
    const fixture = TestBed.createComponent(BioTranslation);
    fixture.componentRef.setInput('account', account);
    fixture.detectChanges();
    return fixture;
  }

  const click = (f: ComponentFixture<BioTranslation>, label: string) =>
    [...(f.nativeElement as HTMLElement).querySelectorAll('button')]
      .find((b) => b.getAttribute('aria-label') === label || b.textContent?.includes(label))!
      .click();

  it('translates the bio without the server and keeps a way back', async () => {
    const translate = vi.fn().mockResolvedValue({
      kind: 'text',
      text: 'I photograph birds on the Rhine.\nHome: Cologne',
      engine: 'mymemory',
      source: 'de',
      target: 'en',
    });
    const f = setUp(translate);
    click(f, 'Translate bio');
    await f.whenStable();
    f.detectChanges();
    expect(translate.mock.calls[0][0]).toMatchObject({
      mode: 'manual',
      serverCanTranslate: false,
      status: expect.objectContaining({ id: 'profile-bio:9' }),
    });
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.text')?.textContent).toContain('Home: Cologne');
    expect(el.querySelector('.credit')?.textContent).toContain('MyMemory');
    click(f, 'Hide translation');
    f.detectChanges();
    expect(el.querySelector('.text')).toBeNull();
  });

  it('asks which language it is in when detection is unsure', async () => {
    const translate = vi
      .fn()
      .mockResolvedValueOnce({ kind: 'ask', candidates: ['de', 'nl'], target: 'en' })
      .mockResolvedValueOnce({ kind: 'failed', attempts: [], source: 'nl', target: 'en' });
    const f = setUp(translate);
    click(f, 'Translate bio');
    await f.whenStable();
    f.detectChanges();
    click(f, 'Translate from Dutch');
    await f.whenStable();
    f.detectChanges();
    expect(translate.mock.calls[1][0]).toMatchObject({ source: 'nl', force: true });
    expect((f.nativeElement as HTMLElement).textContent).toContain("Couldn't translate this bio");
  });
});
