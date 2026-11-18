import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MbProgress } from '../progress/progress';
import { MbBarList, MbStatGrid } from './stats';

@Component({
  imports: [MbStatGrid],
  template: `<dl mbStatGrid>
    <div>
      <dt>Posts</dt>
      <dd>10,486</dd>
    </div>
    <div>
      <dt>Likes</dt>
      <dd>21,468</dd>
    </div>
  </dl>`,
})
class StatHost {}

describe('MbStatGrid', () => {
  it('keeps native description-list semantics for label and value', async () => {
    const fixture = TestBed.createComponent(StatHost);
    await fixture.whenStable();
    const terms = [...(fixture.nativeElement as HTMLElement).querySelectorAll('dl > div > dt')];
    expect(terms.map((term) => term.textContent)).toEqual(['Posts', 'Likes']);
    expect(terms[0].nextElementSibling?.textContent).toBe('10,486');
  });
});

describe('MbBarList', () => {
  it('names the list, shows every value as text and keeps bars decorative and proportional', async () => {
    const fixture = TestBed.createComponent(MbBarList);
    fixture.componentRef.setInput('label', 'Posts per year');
    fixture.componentRef.setInput('items', [
      { label: '2021', value: 50, display: '50' },
      { label: '2022', value: 200, display: '200' },
      { label: '2023', value: 0 },
    ]);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('ol')?.getAttribute('aria-label')).toBe('Posts per year');
    const rows = [...root.querySelectorAll('li')];
    expect(rows.map((row) => row.querySelector('.value')?.textContent)).toEqual(['50', '200', '0']);
    const bars = [...root.querySelectorAll<HTMLElement>('.bar')];
    expect(bars.map((bar) => bar.style.inlineSize)).toEqual(['25%', '100%', '0%']);
    expect(root.querySelector('.track')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('MbProgress', () => {
  it('labels a native progress bar, and is indeterminate without a max', async () => {
    const fixture = TestBed.createComponent(MbProgress);
    fixture.componentRef.setInput('label', 'Search progress');
    fixture.componentRef.setInput('caption', 'Checked 120 of 400');
    fixture.componentRef.setInput('value', 120);
    fixture.componentRef.setInput('max', 400);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const bar = root.querySelector('progress')!;
    expect(root.querySelector(`#${bar.getAttribute('aria-labelledby')}`)?.textContent).toBe(
      'Search progress',
    );
    expect(bar.value).toBe(120);
    expect(bar.max).toBe(400);
    expect(root.textContent).toContain('Checked 120 of 400');

    fixture.componentRef.setInput('max', 0);
    await fixture.whenStable();
    expect(root.querySelector('progress')!.hasAttribute('value')).toBe(false);
  });
});
