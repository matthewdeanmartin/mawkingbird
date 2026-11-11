import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { decompressFromEncodedURIComponent } from 'lz-string';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { codeFileName, extractCodeBlocks, languageLabel, normalizeLanguage } from './code-fences';
import { highlightToHtml, tokenizeLines } from './code-highlight';
import { playgroundFor } from './code-playgrounds';
import { CodeMenuItems } from './code-menu-items';
import { HighlightCode, loadHighlighter } from './highlight-code';
import { CodeImageDialog } from './code-image-dialog';
import { ALT_TEXT_LIMIT } from './code-image';

describe('code fences', () => {
  it('extracts each complete block with its normalised language', () => {
    const html =
      '<p>intro</p><p>```py<br>print(1)<br>```</p><p>~~~sh<br>ls -la<br>~~~</p><p>```<br>open';
    expect(extractCodeBlocks(html)).toEqual([
      { language: 'python', code: 'print(1)' },
      { language: 'bash', code: 'ls -la' },
    ]);
  });

  it('finds nothing in a post without fences', () => {
    expect(extractCodeBlocks('<p>just `inline` code</p>')).toEqual([]);
  });

  it('names files by language and position', () => {
    expect(codeFileName({ language: 'python', code: '' })).toBe('snippet.py');
    expect(codeFileName({ language: 'typescript', code: '' }, 1)).toBe('snippet-2.ts');
    expect(codeFileName({ language: 'brainfuck', code: '' })).toBe('snippet.txt');
  });

  it('resolves aliases and labels', () => {
    expect(normalizeLanguage(' JS ')).toBe('javascript');
    expect(normalizeLanguage('c++')).toBe('cpp');
    expect(languageLabel('bash')).toBe('Shell');
    expect(languageLabel('')).toBe('');
  });
});

describe('code highlighting', () => {
  it('colours a known language and declines an unknown one', () => {
    expect(highlightToHtml('def f(): pass', 'python')).toContain('hljs-keyword');
    expect(highlightToHtml('x', 'brainfuck')).toBeNull();
  });

  it('escapes code rather than passing it through as HTML', () => {
    expect(highlightToHtml('"<img src=x onerror=alert(1)>"', 'javascript')).not.toContain('<img');
  });

  it('splits highlighted code into lines of scoped tokens', () => {
    const lines = tokenizeLines('def f():\n    return "hi"', 'python');
    expect(lines).toHaveLength(2);
    expect(lines[0].find((t) => t.text === 'def')?.scope).toBe('keyword');
    expect(lines[1].find((t) => t.text === '"hi"')?.scope).toBe('string');
  });
});

describe('code playgrounds', () => {
  it('puts Python in the Python Tutor fragment', async () => {
    const url = await playgroundFor({ language: 'python', code: 'x = 1' })!.url('x = 1');
    expect(url).toBe('https://pythontutor.com/visualize.html#code=x%20%3D%201&py=3');
  });

  it('compresses TypeScript into the playground fragment', async () => {
    const url = await playgroundFor({ language: 'typescript', code: '' })!.url('let a: number;');
    const encoded = url.split('#code/')[1];
    expect(decompressFromEncodedURIComponent(encoded)).toBe('let a: number;');
  });

  it('offers nothing for languages without a playground', () => {
    expect(playgroundFor({ language: 'sql', code: '' })).toBeNull();
  });
});

describe('CodeMenuItems', () => {
  afterEach(() => vi.restoreAllMocks());

  function rows(content: string): HTMLButtonElement[] {
    const fixture = TestBed.createComponent(CodeMenuItems);
    fixture.componentRef.setInput('content', content);
    fixture.detectChanges();
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')];
  }

  it('adds nothing to the menu when a post has no code block', () => {
    expect(rows('<p>hello</p>')).toHaveLength(0);
  });

  it('offers copy, save and open for one block', () => {
    const labels = rows('<p>```python<br>x = 1<br>```</p>').map((b) => b.textContent?.trim());
    expect(labels).toEqual(['Copy code', 'Save as snippet.py', 'Open in Python Tutor']);
  });

  it('names each block when a post has several', () => {
    const labels = rows('<p>```python<br>x<br>```</p><p>```sql<br>select 1<br>```</p>').map((b) =>
      b.textContent?.trim(),
    );
    expect(labels).toEqual([
      'Copy Python code',
      'Save as snippet.py',
      'Open in Python Tutor',
      'Copy SQL code',
      'Save as snippet-2.sql',
    ]);
  });

  it('copies the code itself', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    rows('<p>```python<br>x = 1<br>```</p>')[0].click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('x = 1');
  });
});

@Component({
  imports: [HighlightCode],
  template: `<div [innerHTML]="html()" [appHighlightCode]="html()"></div>`,
})
class HighlightHost {
  html = signal('<pre class="mb-code"><code class="language-python">def f(): pass</code></pre>');
}

describe('HighlightCode', () => {
  it('colours rendered blocks once the highlighter has loaded', async () => {
    const fixture = TestBed.createComponent(HighlightHost);
    fixture.detectChanges();
    await loadHighlighter();
    await fixture.whenStable();
    await vi.waitFor(() =>
      expect((fixture.nativeElement as HTMLElement).querySelector('.hljs-keyword')).not.toBeNull(),
    );
  });
});

describe('CodeImageDialog', () => {
  const modal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');

  afterEach(() => {
    TestBed.resetTestingModule();
    for (const [name, descriptor] of [
      ['showModal', modal],
      ['close', close],
    ] as const) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>)[name];
    }
  });

  it('refuses code too long for an image description, and says what to do instead', () => {
    for (const name of ['showModal', 'close'] as const) {
      Object.defineProperty(HTMLDialogElement.prototype, name, {
        configurable: true,
        value() {
          this.open = name === 'showModal';
        },
      });
    }
    const fixture = TestBed.createComponent(CodeImageDialog);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const textarea = element.querySelector('textarea')!;
    textarea.value = 'x'.repeat(ALT_TEXT_LIMIT + 1);
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(element.textContent).toContain('Share it as a paste instead');
    const attach = [...element.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Attach image',
    );
    expect(attach?.disabled).toBe(true);
  });
});
