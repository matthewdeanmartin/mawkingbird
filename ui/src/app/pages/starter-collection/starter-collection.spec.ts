import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { StarterCollection } from './starter-collection';
import { ImportFollows } from '../../import-follows';
import { starterKit } from '../../starter-collection';
import { UiLocale } from '../../i18n/locale';

describe('StarterCollection', () => {
  let httpMock: HttpTestingController;
  let routeStub: { snapshot: { paramMap: ReturnType<typeof convertToParamMap> } };

  beforeEach(() => {
    localStorage.clear();
    routeStub = { snapshot: { paramMap: convertToParamMap({ slug: 'infosec' }) } };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: routeStub,
        },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(Auth).enterAnonymous('https://mastodon.social');
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('opens a clicked member from the built-in Anonymous account snapshot', async () => {
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(StarterCollection);
    fixture.detectChanges();
    const component = fixture.componentInstance as unknown as {
      accounts: readonly { name: string; handle: string }[];
      openAccount(item: { name: string; handle: string }): Promise<void>;
    };

    const opening = component.openAccount(component.accounts[0]);
    await opening;

    httpMock.expectNone((candidate) => candidate.url.includes('/api/v2/search'));

    expect(navigate).toHaveBeenCalledWith([
      '/accounts',
      expect.stringMatching(/^anonymous-account\./),
    ]);
  });

  it('loads the themed kit selected by the route', () => {
    const fixture = TestBed.createComponent(StarterCollection);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('InfoSec');
    expect(fixture.componentInstance['accounts']).toHaveLength(8);
  });

  it('follows a catalogue kit anonymously using its home-instance snapshots', async () => {
    routeStub.snapshot.paramMap = convertToParamMap({
      slug: 'catalog-de-technology',
    });
    const fixture = TestBed.createComponent(StarterCollection);
    fixture.detectChanges();
    const importer = TestBed.inject(ImportFollows);
    const kit = starterKit('catalog-de-technology')!;
    expect(importer.rows().map((row) => row.account?.id)).toEqual(
      kit.accounts.map((item) => item.account.id),
    );
    await importer.start();
    expect(importer.rows().every((row) => row.status === 'followed')).toBe(true);
    httpMock.expectNone((request) => request.url.includes('/api/v2/search'));
  });

  it('resolves catalogue handles for signed-in follow-all instead of using foreign IDs', () => {
    routeStub.snapshot.paramMap = convertToParamMap({
      slug: 'catalog-de-technology',
    });
    vi.spyOn(TestBed.inject(Auth), 'isAnonymous', 'get').mockReturnValue(false);
    const fixture = TestBed.createComponent(StarterCollection);
    fixture.detectChanges();
    const importer = TestBed.inject(ImportFollows);
    expect(importer.rows().map((row) => row.handle)).toEqual(
      starterKit('catalog-de-technology')!.accounts.map((item) => item.handle),
    );
    expect(importer.rows().every((row) => row.account === undefined)).toBe(true);
    const start = vi.spyOn(importer, 'start').mockResolvedValue();
    fixture.componentInstance.followAll();
    expect(start).toHaveBeenCalledOnce();
  });

  it('does not substitute another kit for a removed catalogue link', () => {
    routeStub.snapshot.paramMap = convertToParamMap({
      slug: 'catalog-de-removed',
    });
    const fixture = TestBed.createComponent(StarterCollection);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('nicht mehr verfügbar');
    expect(fixture.nativeElement.querySelector('button')).toBeNull();
    expect(TestBed.inject(ImportFollows).rows()).toEqual([]);
  });

  it('opens and follows a Russian pack in Russian without switching the app language', async () => {
    routeStub.snapshot.paramMap = convertToParamMap({ slug: 'catalog-ru-technology' });
    const fixture = TestBed.createComponent(StarterCollection);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('section')?.getAttribute('lang')).toBe('ru');
    expect(el.textContent).toContain('Технологии');
    expect(el.textContent).toContain('Программисты');
    expect(el.querySelector('.intro button')?.textContent).toContain('Подписаться на всех');
    await TestBed.inject(ImportFollows).start();
    fixture.detectChanges();
    expect(el.querySelector('.intro button')?.textContent).toContain('Оформлено подписок');
    expect(el.textContent).toContain('Вы подписаны');
    expect(TestBed.inject(UiLocale).active()).toBe('en');
  });
});
