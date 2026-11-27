import { Component, input, output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkTimeline } from '../../feeds/link-timeline/link-timeline';
import { Api } from '../../platform/api/api';
import { Status } from '../../platform/api/models';
import { Auth } from '../../platform/session/auth';
import { StatusCard } from '../../posts/status-card/status-card';
import { Compose } from '../../publishing/compose/compose';
import { Drafts } from '../../publishing/drafts';
import { post } from '../../testing/forum-fixtures';
import { PAGE_PANEL_DRAFT_CONTEXT, PagePanel } from './page-panel';

@Component({ selector: 'app-compose', template: '' })
class ComposeStub {
  readonly compact = input(false);
  readonly draftContext = input('');
  readonly initialText = input('');
  readonly posted = output<Status>();
}

@Component({ selector: 'app-status-card', template: '' })
class StatusCardStub {
  readonly status = input<Status>();
  readonly filterContext = input('home');
}

@Component({ selector: 'app-link-timeline', template: '' })
class LinkTimelineStub {}

const PAGE = 'https://news.example/story';

describe('PagePanel', () => {
  let search: ReturnType<typeof vi.fn>;
  let loadAutosave: ReturnType<typeof vi.fn>;
  let clearAutosave: ReturnType<typeof vi.fn>;
  let auth: { isAnonymous: boolean; isForeignPrimary: boolean };

  beforeEach(() => {
    search = vi.fn(() => of({ accounts: [], statuses: [post('7', 'me')], hashtags: [] }));
    loadAutosave = vi.fn(() => null);
    clearAutosave = vi.fn(() => ({ durable: true }));
    auth = { isAnonymous: false, isForeignPrimary: false };
  });

  function setUp(params: Record<string, string>): ComponentFixture<PagePanel> {
    TestBed.configureTestingModule({
      providers: [
        { provide: Api, useValue: { search } },
        { provide: Auth, useValue: auth },
        { provide: Drafts, useValue: { loadAutosave, clearAutosave } },
        { provide: ActivatedRoute, useValue: { queryParamMap: of(convertToParamMap(params)) } },
      ],
    });
    TestBed.overrideComponent(PagePanel, {
      remove: { imports: [Compose, StatusCard, LinkTimeline] },
      add: { imports: [ComposeStub, StatusCardStub, LinkTimelineStub] },
    });
    const fixture = TestBed.createComponent(PagePanel);
    fixture.detectChanges();
    return fixture;
  }

  const el = (f: ComponentFixture<PagePanel>) => f.nativeElement as HTMLElement;
  const button = (f: ComponentFixture<PagePanel>, label: string) =>
    [...el(f).querySelectorAll('button')].find((b) => b.textContent?.includes(label))!;

  it('asks for a web page when given none, and makes no request', () => {
    const f = setUp({ url: 'about:blank' });
    expect(el(f).textContent).toContain('Open a web page');
    expect(el(f).querySelector('app-link-timeline')).toBeNull();
    expect(search).not.toHaveBeenCalled();
  });

  it("shows the reader's own posts about the page from one from:me search", () => {
    const f = setUp({ url: PAGE, title: 'A story' });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith(`from:me ${PAGE}`, 'statuses', {
      limit: 5,
      homeServer: true,
    });
    expect(el(f).textContent).toContain('You posted about this page');
    expect(el(f).querySelectorAll('.panel-mine app-status-card')).toHaveLength(1);
    expect(el(f).querySelector('app-link-timeline')).not.toBeNull();
  });

  it('does not search for its own posts without a Mastodon sign-in', () => {
    auth.isAnonymous = true;
    const f = setUp({ url: PAGE });
    expect(search).not.toHaveBeenCalled();
    expect(el(f).querySelector('.panel-mine')).toBeNull();
  });

  it('opens the composer only when asked, seeded with the title and link', () => {
    const f = setUp({ url: PAGE, title: 'A story' });
    expect(el(f).querySelector('app-compose')).toBeNull();

    button(f, 'Write about this page').click();
    f.detectChanges();
    const compose = f.debugElement.query((d) => d.name === 'app-compose')
      .componentInstance as ComposeStub;
    expect(compose.draftContext()).toBe(PAGE_PANEL_DRAFT_CONTEXT);
    expect(compose.initialText()).toBe(`A story\n\n${PAGE}`);
  });

  it('offers to continue or discard an unsent post about another page', () => {
    loadAutosave.mockReturnValue({ segments: ['Look at https://other.example/'] });
    const f = setUp({ url: PAGE });
    expect(el(f).textContent).toContain('unsent post about another page');
    expect(el(f).textContent).not.toContain('Write about this page');

    button(f, 'Discard it').click();
    f.detectChanges();
    expect(clearAutosave).toHaveBeenCalledWith(PAGE_PANEL_DRAFT_CONTEXT);
    expect(el(f).textContent).toContain('Write about this page');
  });

  it('continues the older post without seeding over it', () => {
    loadAutosave.mockReturnValue({ segments: ['Look at https://other.example/'] });
    const f = setUp({ url: PAGE });
    button(f, 'Continue it').click();
    f.detectChanges();
    const compose = f.debugElement.query((d) => d.name === 'app-compose')
      .componentInstance as ComposeStub;
    expect(compose.initialText()).toBe('');
  });

  it('treats an unsent post about this same page as this page', () => {
    loadAutosave.mockReturnValue({ segments: [`Draft about ${PAGE}`] });
    const f = setUp({ url: PAGE });
    expect(el(f).textContent).not.toContain('another page');
  });
});
