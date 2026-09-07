import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_PROMPTS,
  PromptTemplateStore,
  renderTemplate,
  PROMPT_TEMPLATES,
} from './prompt-templates';

describe('renderTemplate', () => {
  it('substitutes known placeholders', () => {
    expect(renderTemplate('Find {{request}} now', { request: 'cats' })).toBe('Find cats now');
  });

  it('leaves unknown placeholders visible, so a typo is noticeable', () => {
    // Blanking it would silently produce a worse prompt with no clue why.
    expect(renderTemplate('Find {{requst}}', { request: 'cats' })).toBe('Find {{requst}}');
  });

  it('collapses the hole left by an empty first-pass feedback block', () => {
    const rendered = renderTemplate('A\n\n{{feedback}}\n\nB', { feedback: '' });
    expect(rendered).toBe('A\n\nB');
  });

  it('substitutes every occurrence', () => {
    expect(renderTemplate('{{a}} and {{a}}', { a: 'x' })).toBe('x and x');
  });
});

describe('PromptTemplateStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  function store(): PromptTemplateStore {
    return TestBed.inject(PromptTemplateStore);
  }

  it('starts on the shipped prompts', () => {
    const s = store();
    for (const spec of PROMPT_TEMPLATES) {
      expect(s.text(spec.id)).toBe(DEFAULT_PROMPTS[spec.id]);
      expect(s.isCustom(spec.id)).toBe(false);
    }
  });

  it('persists an edit and marks it customised', () => {
    store().set('search', 'my own prompt');

    expect(store().text('search')).toBe('my own prompt');
    expect(store().isCustom('search')).toBe(true);
    // Unscoped, like the connection it belongs to.
    expect(localStorage.getItem('mockingbird_openrouter_prompts')).toContain('my own prompt');
  });

  it('leaves the other template alone', () => {
    store().set('search', 'custom');
    expect(store().text('tag')).toBe(DEFAULT_PROMPTS.tag);
  });

  it('resets back to the shipped text and forgets the override', () => {
    const s = store();
    s.set('search', 'custom');
    s.reset('search');

    expect(s.text('search')).toBe(DEFAULT_PROMPTS.search);
    expect(s.isCustom('search')).toBe(false);
    expect(localStorage.getItem('mockingbird_openrouter_prompts')).toBeNull();
  });

  it('treats saving the default back as a reset, not a customisation', () => {
    const s = store();
    // Otherwise the "customised" marker lies and can never be cleared.
    s.set('search', DEFAULT_PROMPTS.search);
    expect(s.isCustom('search')).toBe(false);
  });

  it('treats an empty edit as a reset rather than an empty prompt', () => {
    const s = store();
    s.set('search', 'custom');
    s.set('search', '   ');
    expect(s.text('search')).toBe(DEFAULT_PROMPTS.search);
  });

  it('renders the active template with variables', () => {
    const s = store();
    s.set('search', 'Looking for: {{request}}');
    expect(s.render('search', { request: 'rust compilers' })).toBe('Looking for: rust compilers');
  });

  it('ignores malformed stored overrides rather than throwing on boot', () => {
    localStorage.setItem('mockingbird_openrouter_prompts', 'not json');
    expect(store().text('tag')).toBe(DEFAULT_PROMPTS.tag);
  });

  it('ignores stored values that are not usable strings', () => {
    localStorage.setItem(
      'mockingbird_openrouter_prompts',
      JSON.stringify({ search: 42, tag: '   ' }),
    );
    const s = store();
    expect(s.isCustom('search')).toBe(false);
    expect(s.isCustom('tag')).toBe(false);
  });
});

describe('the shipped prompts', () => {
  it('give the search model only operators the serializer emits', () => {
    // The model cannot see mastodon-query-serializer.ts, and an unsupported
    // operator fails silently by returning more than asked for.
    for (const operator of ['from:', 'has:media', 'is:reply', 'language:', 'in:public']) {
      expect(DEFAULT_PROMPTS.search).toContain(operator);
    }
    expect(DEFAULT_PROMPTS.search).toContain('{{request}}');
    expect(DEFAULT_PROMPTS.search).toContain('{{feedback}}');
  });

  it('tell the tag model to drop the leading hash', () => {
    expect(DEFAULT_PROMPTS.tag).toContain('without the leading #');
    expect(DEFAULT_PROMPTS.tag).toContain('{{post}}');
    expect(DEFAULT_PROMPTS.tag).toContain('{{feedback}}');
  });

  it('forbids the proofreader from becoming a ghostwriter', () => {
    expect(DEFAULT_PROMPTS.proofread).toContain('do not rewrite');
    expect(DEFAULT_PROMPTS.proofread).toContain('Do not compose a better reply');
    expect(DEFAULT_PROMPTS.proofread).toContain('{{replyContext}}');
    expect(DEFAULT_PROMPTS.proofread).toContain('{{text}}');
  });
});
