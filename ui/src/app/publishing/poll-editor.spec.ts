import { describe, expect, it } from 'vitest';
import { PollEditor } from './poll-editor';

describe('PollEditor draft handoff', () => {
  it('preserves unfinished choices, multiple selection and expiry across editor instances', () => {
    const composer = new PollEditor();
    composer.restore({ options: [' yes ', '', 'no'], multiple: true, expiresIn: 300 });
    const write = new PollEditor();
    write.restore(composer.snapshot());
    expect(write.snapshot()).toEqual(composer.snapshot());
    expect(write.filledOptions()).toEqual(['yes', 'no']);
    write.setOption(0, 'changed');
    expect(composer.options()[0]).toBe(' yes ');
  });

  it('restores legacy short lists and enforces the same editing bounds', () => {
    const editor = new PollEditor();
    editor.restore({ options: ['x'], multiple: false, expiresIn: 300 });
    expect(editor.options()).toEqual(['', '']);
    expect(editor.valid()).toBe(false);
    expect(editor.removeOption(0)).toBe(false);
    expect(editor.addOption()).toBe(true);
    expect(editor.addOption()).toBe(true);
    expect(editor.addOption()).toBe(false);
    editor.restore(null);
    expect(editor.snapshot()).toBeNull();
  });
});
