import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../auth';
import { FollowBundleTags } from './follow-bundle-tags';
import { TagActions } from './tag-actions';
import { TagState } from './tag-state';
import { AnonymousTags } from '../providers/anonymous/anonymous-tags';

describe('Following bundle tags', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<FollowBundleTags>;
  const tick = async (): Promise<void> => {
    await Promise.resolve();
    fixture.detectChanges();
  };
  const click = (label: string): void => {
    const button = [
      ...(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>),
    ].find((item) => item.textContent?.trim() === label);
    expect(button, label).toBeTruthy();
    button!.click();
    fixture.detectChanges();
  };
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(Auth).setToken('bundle-test');
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(FollowBundleTags);
    fixture.componentRef.setInput('tags', ['cats', 'dogs', 'birds']);
    fixture.detectChanges();
  });
  afterEach(() => {
    http.verify();
  });

  it('previews only unfollowed tags and retries only failures', async () => {
    const state = TestBed.inject(TagState);
    http.expectNone((request) => request.method === 'POST');
    click('Follow all tags…');
    for (const name of ['cats', 'dogs', 'birds']) {
      http.expectOne(`/api/v1/tags/${name}`).flush({ name, following: name === 'cats' });
      await tick();
    }
    expect(fixture.nativeElement.textContent).toContain('Follow 2 remaining tags');
    http.expectNone((request) => request.method === 'POST');
    click('Follow these tags');
    http.expectOne('/api/v1/tags/dogs/follow').flush({ name: 'dogs', following: true });
    await tick();
    http
      .expectOne('/api/v1/tags/birds/follow')
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await tick();
    expect(state.get('dogs')?.following).toBe(true);
    expect(fixture.nativeElement.textContent).toContain('Followed 1 of 2 tags');
    click('Retry remaining tags');
    http.expectNone('/api/v1/tags/dogs/follow');
    http.expectOne('/api/v1/tags/birds/follow').flush({ name: 'birds', following: true });
    await tick();
    expect(fixture.nativeElement.textContent).toContain('All tags in this bundle are followed');
  });

  it('stops at rate limits and does not send a retry before Retry-After', async () => {
    click('Follow all tags…');
    for (const name of ['cats', 'dogs', 'birds']) {
      http.expectOne(`/api/v1/tags/${name}`).flush({ name, following: false });
      await tick();
    }
    click('Follow these tags');
    http
      .expectOne('/api/v1/tags/cats/follow')
      .flush({}, { status: 429, statusText: 'Slow down', headers: { 'Retry-After': '120' } });
    await tick();
    expect(fixture.nativeElement.textContent).toContain('server asked us to slow down');
    click('Retry remaining tags');
    http.expectNone((request) => request.method === 'POST');
  });

  it('handles anonymous limits without dropping successful follows', async () => {
    TestBed.inject(Auth).enterAnonymous('https://example.com');
    const tags = TestBed.inject(AnonymousTags);
    for (let n = 0; n < 9; n++) tags.follow(`existing${n}`);
    click('Follow all tags…');
    await tick();
    click('Follow these tags');
    await tick();
    expect(tags.has('cats')).toBe(true);
    expect(tags.has('dogs')).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Followed 1 of 3 tags');
    http.expectNone((request) => request.method === 'POST');
  });
});

describe('Shared tag actions', () => {
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(Auth).setToken('actions-test');
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('resolves an unknown relationship on intent and synchronizes other visible controls', async () => {
    const first = TestBed.createComponent(TagActions);
    first.componentRef.setInput('name', 'cats');
    // A late response for the previously viewed tag must not seed this tag's state.
    first.componentRef.setInput('info', { name: 'dogs', following: true });
    const second = TestBed.createComponent(TagActions);
    second.componentRef.setInput('name', 'cats');
    for (const fixture of [first, second]) {
      fixture.componentRef.setInput('name', 'cats');
      fixture.detectChanges();
    }
    http.expectNone('/api/v1/tags/cats');
    first.nativeElement.querySelector('button').click();
    http.expectOne('/api/v1/tags/cats').flush({ name: 'cats', following: false });
    await Promise.resolve();
    http.expectOne('/api/v1/tags/cats/follow').flush({ name: 'cats', following: true });
    await Promise.resolve();
    second.detectChanges();
    expect(second.nativeElement.querySelector('button').textContent.trim()).toBe('Following');
  });
});
