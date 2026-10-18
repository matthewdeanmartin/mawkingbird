import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, input } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Auth } from '../../auth';
import { Status } from '../../models';
import { StatusCard } from '../../status-card/status-card';
import { WatchPartiesPage } from './watch-parties-page';

@Component({ selector: 'app-status-card', template: '<p class="card">{{ status().id }}</p>' })
class CardStub {
  readonly status = input.required<Status>();
}

const post = (id: string, created: string, content: string): Status =>
  ({
    id,
    url: `https://home.test/@x/${id}`,
    created_at: created,
    content,
    media_attachments: [],
    card: null,
    reblog: null,
  }) as unknown as Status;
const youtubePost = (id: string, created: string) =>
  post(id, created, '<p><a href="https://youtu.be/aaaaaaaaaaa">watch</a></p>');

describe('WatchPartiesPage', () => {
  let fixture: ComponentFixture<WatchPartiesPage>;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [WatchPartiesPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    TestBed.overrideComponent(WatchPartiesPage, {
      remove: { imports: [StatusCard] },
      add: { imports: [CardStub] },
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(Auth).kind.set('mastodon');
    TestBed.inject(Auth).token.set('t');
  });

  afterEach(() => {
    http.match(() => true);
    http.verify();
  });

  async function mount(tags?: string): Promise<HTMLElement> {
    if (tags) await TestBed.inject(Router).navigate([], { queryParams: { tags } });
    fixture = TestBed.createComponent(WatchPartiesPage);
    fixture.detectChanges();
    http
      .match((r) => r.url === '/api/v1/followed_tags')
      .forEach((r) => r.flush([{ name: 'Cats' }]));
    http
      .match((r) => r.url === '/api/v1/trends/tags')
      .forEach((r) => r.flush([{ name: 'Debate' }]));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('suggests followed and trending tags before anything is chosen', async () => {
    const host = await mount();
    expect(host.textContent).toContain('Find a watch party');
    const links = [...host.querySelectorAll('.tag-list a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/videos/parties?tags=Cats', '/videos/parties?tags=Debate']);
  });

  it('lists the video posts under the chosen tags and opens one as a party', async () => {
    const host = await mount('Debate,Live');
    http
      .expectOne((r) => r.url === '/api/v1/timelines/tag/Debate')
      .flush([youtubePost('1', '2026-10-01T00:00:00Z'), post('2', '2026-10-03T00:00:00Z', 'text')]);
    http
      .expectOne((r) => r.url === '/api/v1/timelines/tag/Live')
      .flush([youtubePost('3', '2026-10-02T00:00:00Z')]);
    fixture.detectChanges();

    expect([...host.querySelectorAll('.card')].map((c) => c.textContent)).toEqual(['3', '1']);
    expect(host.textContent).toContain('2 recent video posts');
    const open = host.querySelector('.party a') as HTMLAnchorElement;
    expect(open.textContent).toContain('Open party');
    const url = new URL(open.getAttribute('href')!, 'https://x.test');
    expect(url.pathname).toBe('/watch');
    expect(url.searchParams.get('post')).toBe('3');
    expect(url.searchParams.get('youtube')).toBe('aaaaaaaaaaa');
    expect(url.searchParams.get('tags')).toBe('Debate,Live');
  });

  it('says so when a tag has no video, and rejects input that is not a hashtag', async () => {
    const host = await mount('Quiet');
    http.expectOne((r) => r.url === '/api/v1/timelines/tag/Quiet').flush([]);
    fixture.detectChanges();
    expect(host.textContent).toContain('No recent posts with a video under #Quiet');

    const input = host.querySelector('input') as HTMLInputElement;
    input.value = '!!!';
    input.dispatchEvent(new Event('input'));
    (host.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });
});
