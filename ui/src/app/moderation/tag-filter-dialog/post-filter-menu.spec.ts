import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { Status } from '../../platform/api/models';
import { PostFilterMenu } from './post-filter-menu';

interface MenuState {
  mode(): 'simple' | 'advanced' | null;
  validTags(): string[];
  switchMode(mode: 'simple' | 'advanced'): void;
}

describe('PostFilterMenu', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
    });
  });

  function setUp(tags: string[], advanced = false): ComponentFixture<PostFilterMenu> {
    const fixture = TestBed.createComponent(PostFilterMenu);
    fixture.componentRef.setInput('tags', tags);
    fixture.componentRef.setInput('status', { id: '7' } as Status);
    fixture.componentRef.setInput('advanced', advanced);
    fixture.detectChanges();
    return fixture;
  }

  function labels(fixture: ComponentFixture<PostFilterMenu>): string[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'), (button) =>
      button.textContent!.replace(/\s+/g, ' ').trim(),
    );
  }

  const state = (fixture: ComponentFixture<PostFilterMenu>) =>
    fixture.componentInstance as unknown as MenuState;

  it('offers a single Build filter row however many tags the post has', () => {
    expect(labels(setUp(['one']))).toEqual(['Build filter for post…']);
    expect(labels(setUp(['a', 'b', 'c', 'd', 'e', 'f', 'g'], true))).toEqual([
      'Build filter for post…',
    ]);
  });

  it('hands the Simple picker each valid tag once, ignoring case', () => {
    const fixture = setUp(['Cats', 'cats', '#Dogs', 'not a tag']);
    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    expect(state(fixture).mode()).toBe('simple');
    expect(state(fixture).validTags()).toEqual(['Cats', 'Dogs']);
  });

  it('opens Advanced for a post without tags, and offers nothing when neither applies', () => {
    expect(labels(setUp([]))).toEqual([]);
    const fixture = setUp([], true);
    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    fixture.detectChanges();
    expect(state(fixture).mode()).toBe('advanced');
    expect((fixture.nativeElement as HTMLElement).querySelector('app-filter-post-dialog')).not.toBe(
      null,
    );
  });

  it('switches between Simple and Advanced only where both apply', () => {
    const both = setUp(['cats'], true);
    (both.nativeElement as HTMLElement).querySelector('button')!.click();
    state(both).switchMode('advanced');
    expect(state(both).mode()).toBe('advanced');
    state(both).switchMode('simple');
    expect(state(both).mode()).toBe('simple');

    const tagsOnly = setUp(['cats']);
    (tagsOnly.nativeElement as HTMLElement).querySelector('button')!.click();
    state(tagsOnly).switchMode('advanced');
    expect(state(tagsOnly).mode()).toBe('simple');
  });
});
