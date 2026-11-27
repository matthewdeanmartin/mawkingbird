import { provideHttpClient, withXhr } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeatureFlags } from '../../platform/build/feature-flags';
import { Auth } from '../../platform/session/auth';
import { DiscoveryWindow } from '../../wellness/discovery-window';
import { ScreenShare } from '../screen-share/screen-share';
import { EvenMore } from './even-more';
import { EVEN_MORE_SECTIONS } from './even-more-links';

/** "Even more" (spec/sprint/explore-2026-11.md, Sprint 5). */
describe('EvenMore', () => {
  let fixture: ComponentFixture<EvenMore>;
  let closed: number;

  function setUp(discoveryOpen = true): HTMLElement {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withXhr()),
        provideHttpClientTesting(),
        provideRouter([]),
        ...(discoveryOpen ? [] : [{ provide: DiscoveryWindow, useValue: { open: () => false } }]),
      ],
    });
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
    fixture = TestBed.createComponent(EvenMore);
    closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  function hrefs(host: HTMLElement): string[] {
    return [...host.querySelectorAll('.em-links a')].map((a) => a.getAttribute('href') ?? '');
  }

  it('offers the rarely used tools on top', () => {
    const host = setUp();
    const tools = [...host.querySelectorAll('.em-section:first-of-type li')].map((el) =>
      el.textContent?.trim(),
    );
    expect(tools).toEqual(['Start screen share mode', 'Onboarding', 'Observability']);
  });

  it('gives every link a unique id and a path, so the table stays reviewable', () => {
    const ids = EVEN_MORE_SECTIONS.flatMap((s) => s.links.map((l) => `${s.id}/${l.id}`));
    expect(new Set(ids).size).toBe(ids.length);
    for (const section of EVEN_MORE_SECTIONS) {
      for (const item of section.links) expect(item.link.startsWith('/')).toBe(true);
    }
  });

  it('lists Explore and the rows squeezed out of the … menu', () => {
    const links = hrefs(setUp());
    expect(links).toEqual(
      expect.arrayContaining(['/explore/feed', '/feeds/lists', '/drafts', '/storage-diagnostics']),
    );
  });

  it('files Feed checkup under Diagnostics, not Explore', () => {
    const links = (id: string) =>
      EVEN_MORE_SECTIONS.find((section) => section.id === id)!.links.map((item) => item.link);
    expect(links('diagnostics')).toContain('/explore/feed');
    expect(links('explore')).not.toContain('/explore/feed');
  });

  it('offers a link only where its feature is on', () => {
    const host = setUp();
    const flags = TestBed.inject(FeatureFlags);
    flags.setState('pastebin', 'off');
    fixture.detectChanges();
    expect(hrefs(host)).not.toContain('/pastes');
    flags.setState('pastebin', 'production');
    fixture.detectChanges();
    expect(hrefs(host)).toContain('/pastes');
  });

  it('drops the Explore section while the discovery window is closed', () => {
    const host = setUp(false);
    expect(hrefs(host).some((href) => href.startsWith('/explore/'))).toBe(false);
    expect(hrefs(host)).toContain('/feeds/lists');
  });

  it('toggles screen share mode and closes', () => {
    const host = setUp();
    (host.querySelector('.em-action') as HTMLButtonElement).click();
    expect(TestBed.inject(ScreenShare).enabled()).toBe(true);
    expect(closed).toBe(1);
  });

  it('closes when a link is followed', () => {
    const host = setUp();
    // The routes are not registered here; the link only has to close the dialog.
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    (host.querySelector('.em-links a') as HTMLAnchorElement).click();
    expect(closed).toBe(1);
  });
});

it('keeps writing in its own section, and Feed Doctor out of Feeds', () => {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(withXhr()), provideHttpClientTesting(), provideRouter([])],
  });
  TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
  const fixture = TestBed.createComponent(EvenMore);
  fixture.detectChanges();
  const host = fixture.nativeElement as HTMLElement;
  const titles = [...host.querySelectorAll('.em-section h3')].map((h) => h.textContent?.trim());
  expect(titles).toEqual(['Tools', 'Explore', 'Feeds', 'Write', 'Diagnostics']);
  expect(host.querySelector('a[href="/feed-doctor"]')).toBeNull();
  expect(host.textContent).not.toContain('Things used now and then');
});
