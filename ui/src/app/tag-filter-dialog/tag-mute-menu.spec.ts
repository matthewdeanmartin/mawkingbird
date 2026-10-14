import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { TagMuteMenu } from './tag-mute-menu';

describe('TagMuteMenu', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  function setUp(tags: string[]): ComponentFixture<TagMuteMenu> {
    const fixture = TestBed.createComponent(TagMuteMenu);
    fixture.componentRef.setInput('tags', tags);
    fixture.detectChanges();
    return fixture;
  }

  function labels(fixture: ComponentFixture<TagMuteMenu>): string[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'), (button) =>
      button.textContent!.replace(/\s+/g, ' ').trim(),
    );
  }

  it('gives each of up to four tags its own row', () => {
    const fixture = setUp(['one', 'two', 'three', 'four']);
    expect(labels(fixture)).toEqual(['Mute #one…', 'Mute #two…', 'Mute #three…', 'Mute #four…']);
    expect((fixture.nativeElement as HTMLElement).querySelector('[aria-expanded]')).toBeNull();
  });

  it('collapses five or more tags behind one toggle row that reveals all of them', () => {
    const tags = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const fixture = setUp(tags);
    const el = fixture.nativeElement as HTMLElement;
    const toggle = el.querySelector<HTMLButtonElement>('button.toggle')!;
    expect(labels(fixture)).toEqual(['▸ Mute a hashtag (7)']);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const list = el.querySelector(`#${toggle.getAttribute('aria-controls')}`)!;
    expect(Array.from(list.querySelectorAll('button'), (b) => b.textContent!.trim())).toEqual(
      tags.map((tag) => `Mute #${tag}…`),
    );

    toggle.click();
    fixture.detectChanges();
    expect(labels(fixture)).toEqual(['▸ Mute a hashtag (7)']);
  });
});
