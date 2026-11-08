import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { BulkWordsDialog, parseWordList } from './bulk-words-dialog';

describe('parseWordList', () => {
  it('takes one word or phrase per line, trimmed, blanks and repeats dropped', () => {
    expect(parseWordList('xyzzy\n\n  big game  \r\nXYZZY\nplugh\n')).toEqual([
      'xyzzy',
      'big game',
      'plugh',
    ]);
  });

  it('lets the caller say which spellings are the same word', () => {
    const key = (word: string) => word.replace(/^#/, '').toLowerCase();
    expect(parseWordList('#tag\ntag\nTAG', key)).toEqual(['#tag']);
  });
});

describe('BulkWordsDialog', () => {
  it('counts what will be added and emits the list in one go', () => {
    const fixture = TestBed.createComponent(BulkWordsDialog);
    const added = vi.fn();
    fixture.componentInstance.added.subscribe(added);
    fixture.detectChanges();
    const root = document.body;
    const textarea = root.querySelector('textarea') as HTMLTextAreaElement;
    textarea.value = 'one\ntwo\none\n';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(root.querySelector('.bulk-count')?.textContent).toContain('2');
    const buttons = [...root.querySelectorAll('button')];
    buttons.at(-1)!.click();
    expect(added).toHaveBeenCalledWith(['one', 'two']);
    fixture.destroy();
  });
});
