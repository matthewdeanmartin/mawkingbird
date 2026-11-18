import { TestBed } from '@angular/core/testing';
import { MbFileDrop, MbPickedFile } from './file-drop';

describe('MbFileDrop', () => {
  async function render(inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(MbFileDrop);
    fixture.componentRef.setInput('label', 'Drop your archive here');
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    const emitted: MbPickedFile[][] = [];
    fixture.componentInstance.files.subscribe((files) => emitted.push(files));
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    return { fixture, root, emitted, input: root.querySelector('input')! };
  }

  it('is a native file input named by its label, described by its hint', async () => {
    const { root, input } = await render({ hint: 'The .zip file', accept: '.zip', multiple: true });
    expect(input.type).toBe('file');
    expect(input.closest('label')?.textContent).toContain('Drop your archive here');
    expect(input.accept).toBe('.zip');
    expect(input.multiple).toBe(true);
    const hint = root.querySelector(`#${input.getAttribute('aria-describedby')}`);
    expect(hint?.textContent).toContain('The .zip file');
  });

  it('emits picked files with their folder paths, and resets so the same file can be picked again', async () => {
    const { input, emitted } = await render({ directory: true });
    expect(input.hasAttribute('webkitdirectory')).toBe(true);
    const file = new File(['x'], 'tweets.js');
    Object.defineProperty(file, 'webkitRelativePath', { value: 'archive/data/tweets.js' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change'));
    expect(emitted).toEqual([[{ path: 'archive/data/tweets.js', file }]]);
    expect(input.value).toBe('');
  });

  it('emits dropped files, and ignores drops while busy', async () => {
    const { fixture, root, emitted } = await render();
    const surface = root.querySelector('label')!;
    const file = new File(['x'], 'archive.zip');
    const drop = () => {
      const event = new Event('drop', { cancelable: true }) as Event & { dataTransfer: unknown };
      event.dataTransfer = { files: [file] };
      surface.dispatchEvent(event);
      return event;
    };
    expect(drop().defaultPrevented).toBe(true);
    expect(emitted).toEqual([[{ path: 'archive.zip', file }]]);

    fixture.componentRef.setInput('busy', true);
    await fixture.whenStable();
    drop();
    expect(emitted).toHaveLength(1);
    expect(root.querySelector('input')!.disabled).toBe(true);
    expect(root.querySelector('[role="status"]')?.textContent).toContain('Drop your archive here');
  });

  it('renders a link presentation without the target chrome', async () => {
    const { root } = await render({ presentation: 'link', hint: 'unused', action: 'unused' });
    expect(root.querySelector('label')?.getAttribute('data-presentation')).toBe('link');
    expect(root.querySelector('.hint')).toBeNull();
    expect(root.querySelector('.action')).toBeNull();
  });
});
