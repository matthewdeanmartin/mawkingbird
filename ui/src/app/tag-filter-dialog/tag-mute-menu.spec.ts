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

  it('offers a single Mute tags row however many tags the post has', () => {
    expect(labels(setUp(['one']))).toEqual(['Mute tags…']);
    expect(labels(setUp(['a', 'b', 'c', 'd', 'e', 'f', 'g']))).toEqual(['Mute tags…']);
  });

  it('hands the picker each valid tag once, ignoring case', () => {
    const fixture = setUp(['Cats', 'cats', '#Dogs', 'not a tag']);
    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    const state = fixture.componentInstance as unknown as { active(): string[] | null };
    expect(state.active()).toEqual(['Cats', 'Dogs']);
  });
});
