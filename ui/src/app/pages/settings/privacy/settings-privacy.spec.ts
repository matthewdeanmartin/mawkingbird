import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SettingsPrivacy } from './settings-privacy';

/** Exposes SettingsPrivacy's protected signals for white-box testing. */
interface SettingsPrivacyInternals {
  locked: WritableSignal<boolean>;
  discoverable: WritableSignal<boolean>;
  bot: WritableSignal<boolean>;
  privacy: WritableSignal<string>;
  sensitive: WritableSignal<boolean>;
  language: WritableSignal<string>;
  saved: WritableSignal<string | null>;
  commit(field: string, value: boolean | string): void;
  errorFor(field: string): string | null;
}

function internals(fixture: ComponentFixture<SettingsPrivacy>): SettingsPrivacyInternals {
  return fixture.componentInstance as unknown as SettingsPrivacyInternals;
}

describe('SettingsPrivacy', () => {
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function setUp(): ComponentFixture<SettingsPrivacy> {
    const fixture = TestBed.createComponent(SettingsPrivacy);
    fixture.detectChanges();
    return fixture;
  }

  it('loads flags from verify_credentials', () => {
    const fixture = setUp();
    httpMock
      .expectOne('/api/v1/accounts/verify_credentials')
      .flush({ locked: true, discoverable: false, bot: true });

    expect(internals(fixture).locked()).toBe(true);
    expect(internals(fixture).discoverable()).toBe(false);
    expect(internals(fixture).bot()).toBe(true);
    expect(internals(fixture).privacy()).toBe('public');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Esperanto');
  });

  it('PATCHes immediately, sending only the field that changed', () => {
    const fixture = setUp();
    httpMock
      .expectOne('/api/v1/accounts/verify_credentials')
      .flush({ locked: false, discoverable: true, bot: false });

    internals(fixture).commit('locked', true);

    const req = httpMock.expectOne('/api/v1/accounts/update_credentials');
    expect(req.request.method).toBe('PATCH');
    const body = req.request.body as FormData;
    expect(body.get('locked')).toBe('true');
    // A FormData update writes every key it names, so the other rows must not
    // ride along — one of them could be a stale value this page never reloaded.
    expect(body.has('discoverable')).toBe(false);
    expect(body.has('bot')).toBe(false);
    expect(body.has('source[privacy]')).toBe(false);

    req.flush({ locked: true, discoverable: true, bot: false });
    expect(internals(fixture).saved()).toBe('locked');
  });

  it('maps posting defaults onto their source[...] keys', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/accounts/verify_credentials').flush({});

    internals(fixture).commit('privacy', 'private');
    const privacyReq = httpMock.expectOne('/api/v1/accounts/update_credentials');
    expect((privacyReq.request.body as FormData).get('source[privacy]')).toBe('private');
    privacyReq.flush({});

    internals(fixture).commit('language', 'fr');
    const langReq = httpMock.expectOne('/api/v1/accounts/update_credentials');
    expect((langReq.request.body as FormData).get('source[language]')).toBe('fr');
    langReq.flush({});
  });

  // Showing "locked" for an account the server left public is the one way this
  // page must not be wrong.
  it('reverts the control and says why when the write fails', () => {
    const fixture = setUp();
    httpMock
      .expectOne('/api/v1/accounts/verify_credentials')
      .flush({ locked: false, discoverable: true, bot: false });

    internals(fixture).commit('locked', true);
    expect(internals(fixture).locked()).toBe(true);

    httpMock
      .expectOne('/api/v1/accounts/update_credentials')
      .flush('nope', { status: 403, statusText: 'Forbidden' });

    expect(internals(fixture).locked()).toBe(false);
    expect(internals(fixture).errorFor('locked')).toContain("won't let you");
    expect(internals(fixture).saved()).toBeNull();
  });

  it('blames the connection, not the reader, when the server is unreachable', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/accounts/verify_credentials').flush({});

    internals(fixture).commit('bot', true);
    httpMock
      .expectOne('/api/v1/accounts/update_credentials')
      .error(new ProgressEvent('network error'));

    expect(internals(fixture).bot()).toBe(false);
    expect(internals(fixture).errorFor('bot')).toContain('reach the server');
  });

  it('keeps an error on the row that caused it', () => {
    const fixture = setUp();
    httpMock.expectOne('/api/v1/accounts/verify_credentials').flush({});

    internals(fixture).commit('locked', true);
    httpMock
      .expectOne('/api/v1/accounts/update_credentials')
      .flush('nope', { status: 500, statusText: 'Server Error' });

    expect(internals(fixture).errorFor('locked')).not.toBeNull();
    expect(internals(fixture).errorFor('bot')).toBeNull();
  });
  for (const field of ['locked', 'discoverable', 'bot', 'sensitive']) {
    it(`shared ${field} checkbox saves one field and restores the native control after failure`, async () => {
      const fixture = setUp();
      httpMock.expectOne('/api/v1/accounts/verify_credentials').flush({});
      await fixture.whenStable();
      const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
        `input[name="${field}"]`,
      )!;
      expect(input.closest('mb-checkbox')).not.toBeNull();
      input.click();
      await fixture.whenStable();
      expect(input.disabled).toBe(true);
      const failed = httpMock.expectOne('/api/v1/accounts/update_credentials');
      const key = field === 'sensitive' ? 'source[sensitive]' : field;
      const sent: string[] = [];
      (failed.request.body as FormData).forEach((_value, name) => sent.push(name));
      expect(sent).toEqual([key]);
      expect(failed.request.body.get(key)).toBe('true');
      failed.flush('unavailable', { status: 503, statusText: 'Unavailable' });
      await fixture.whenStable();
      expect(input.checked).toBe(false);
      expect(input.disabled).toBe(false);
      expect(input.getAttribute('aria-invalid')).toBe('true');
      expect(input.closest('mb-checkbox')!.querySelector('[role="alert"]')).not.toBeNull();
      input.click();
      httpMock.expectOne('/api/v1/accounts/update_credentials').flush({});
      await fixture.whenStable();
      expect(input.checked).toBe(true);
      expect(input.hasAttribute('aria-invalid')).toBe(false);
      expect(input.closest('mb-checkbox')!.querySelector('[role="status"]')).not.toBeNull();
    });
  }
  // Default visibility moved into the posting-defaults row (no single dropdown);
  // its replacement test follows this loop.
  for (const [field, value] of [['language', 'eo']]) {
    it(`shared ${field} select keeps its label, one-field payload and failed-save rollback`, async () => {
      const f = setUp();
      httpMock
        .expectOne('/api/v1/accounts/verify_credentials')
        .flush({ source: { privacy: 'public', language: 'en' } });
      await f.whenStable();
      const select = (f.nativeElement as HTMLElement).querySelector<HTMLSelectElement>(
        `select[name="${field}"]`,
      )!;
      const wrapper = select.closest('mb-field')!;
      expect(wrapper.querySelector('label')!.htmlFor).toBe(select.id);
      const old = select.value;
      select.value = value;
      select.dispatchEvent(new Event('change'));
      await f.whenStable();
      expect(select.disabled).toBe(true);
      const write = httpMock.expectOne('/api/v1/accounts/update_credentials');
      expect(Array.from((write.request.body as FormData).entries())).toEqual([
        [`source[${field}]`, value],
      ]);
      write.flush({}, { status: 503, statusText: 'Unavailable' });
      await f.whenStable();
      expect(select.value).toBe(old);
      expect(select.disabled).toBe(false);
      expect(select.getAttribute('aria-invalid')).toBe('true');
      expect(wrapper.textContent).toContain('503');
      select.value = value;
      select.dispatchEvent(new Event('change'));
      await f.whenStable();
      httpMock.expectOne('/api/v1/accounts/update_credentials').flush({});
      await f.whenStable();
      expect(select.value).toBe(value);
      expect(select.hasAttribute('aria-invalid')).toBe(false);
      expect(wrapper.textContent).toContain('Saved');
    });
  }

  it('saves visibility and quote policy together from the posting-defaults dialog', () => {
    for (const [name, open] of [
      ['showModal', true],
      ['close', false],
    ] as const) {
      Object.defineProperty(HTMLDialogElement.prototype, name, {
        configurable: true,
        value(this: HTMLDialogElement) {
          this.open = open;
        },
      });
    }
    const f = setUp();
    httpMock.expectOne('/api/v1/accounts/verify_credentials').flush({
      hide_collections: false,
      indexable: true,
      source: { privacy: 'unlisted', quote_policy: 'followers', spoiler_field: false },
    });
    f.detectChanges();
    const el = f.nativeElement as HTMLElement;
    // A sentence, not a dropdown, and the newer switches the server reported.
    expect(el.querySelector('select[name="privacy"]')).toBeNull();
    expect(el.textContent).toContain(
      'New posts: everyone can read them, kept out of public timelines, followers can quote them.',
    );
    expect(el.textContent).toContain('Hide who I follow and who follows me');
    expect(el.textContent).toContain('Let my public posts appear in search results');
    expect(el.textContent).toContain('Open the content warning field in new posts');

    [...el.querySelectorAll<HTMLButtonElement>('app-posting-defaults button')]
      .find((b) => b.textContent?.trim() === 'Change…')!
      .click();
    f.detectChanges();
    const dialog = el.querySelector('app-post-permissions')!;
    // Defaults never offer "mentioned people only" or per-post notifications.
    expect(dialog.textContent).not.toContain('Mentioned people only');
    expect(dialog.textContent).not.toContain('Notifications');
    const listed = dialog.querySelectorAll('select')[1] as HTMLSelectElement;
    listed.value = listed.options[0].value;
    listed.dispatchEvent(new Event('change'));
    [...dialog.querySelectorAll<HTMLButtonElement>('button')]
      .find((b) => b.textContent?.trim() === 'Apply')!
      .click();

    const failed = httpMock.expectOne('/api/v1/accounts/update_credentials');
    expect(Array.from((failed.request.body as FormData).entries())).toEqual([
      ['source[privacy]', 'public'],
      ['source[quote_policy]', 'followers'],
    ]);
    failed.flush({}, { status: 503, statusText: 'Unavailable' });
    f.detectChanges();
    expect(el.querySelector('app-post-permissions')?.textContent).toContain(
      'Your defaults were not saved.',
    );

    [...el.querySelectorAll<HTMLButtonElement>('app-post-permissions button')]
      .find((b) => b.textContent?.trim() === 'Apply')!
      .click();
    httpMock.expectOne('/api/v1/accounts/update_credentials').flush({});
    f.detectChanges();
    expect(el.querySelector('app-post-permissions')).toBeNull();
    expect(el.textContent).toContain('shown in public timelines');
  });

  it('writes the newer account switches one field at a time', () => {
    const f = setUp();
    httpMock.expectOne('/api/v1/accounts/verify_credentials').flush({
      hide_collections: false,
      indexable: true,
      source: { privacy: 'public', spoiler_field: false },
    });
    f.detectChanges();
    const ui = f.componentInstance as unknown as {
      commit(field: string, value: boolean): void;
    };
    for (const [field, key] of [
      ['hide_collections', 'hide_collections'],
      ['indexable', 'indexable'],
      ['spoiler_field', 'source[spoiler_field]'],
    ]) {
      ui.commit(field, true);
      const write = httpMock.expectOne('/api/v1/accounts/update_credentials');
      expect(Array.from((write.request.body as FormData).entries())).toEqual([[key, 'true']]);
      write.flush({});
    }
  });

  it('hides the newer switches on servers that do not report them', () => {
    const f = setUp();
    httpMock
      .expectOne('/api/v1/accounts/verify_credentials')
      .flush({ source: { privacy: 'public' } });
    f.detectChanges();
    const text = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(text).not.toContain('Hide who I follow');
    expect(text).not.toContain('appear in search results');
    expect(text).not.toContain('content warning field');
  });
});
