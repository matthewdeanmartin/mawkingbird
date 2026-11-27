import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { ENGLISH_TOOLS } from '../../public-pages/focused-tools';
import { ToolsMenu } from './tools-menu';

describe('ToolsMenu', () => {
  function render() {
    for (const name of ['showModal', 'close'])
      Object.defineProperty(HTMLDialogElement.prototype, name, {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.open = name === 'showModal';
        },
      });
    TestBed.configureTestingModule({
      imports: [ToolsMenu],
      providers: [provideRouter([{ path: '**', children: [] }])],
    });
    const fixture = TestBed.createComponent(ToolsMenu);
    fixture.detectChanges();
    return fixture;
  }

  it('links every English tool page once, grouped, and the /tools index', () => {
    const host = render().nativeElement as HTMLElement;
    const hrefs = [...host.querySelectorAll('.tm-links a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(ENGLISH_TOOLS.map((tool) => `/${tool.path}`)));
    expect(new Set(hrefs).size).toBe(ENGLISH_TOOLS.length);
    expect(host.querySelectorAll('.tm-section h3').length).toBeGreaterThan(1);
    expect(host.querySelector('.tm-all a')?.getAttribute('href')).toBe('/tools');
  });

  it('closes when a tool is chosen', () => {
    const fixture = render();
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    (fixture.nativeElement.querySelector('.tm-links a') as HTMLAnchorElement).click();
    expect(closed).toHaveBeenCalled();
  });
});
