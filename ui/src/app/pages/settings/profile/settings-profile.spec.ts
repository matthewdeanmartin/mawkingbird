import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WritableSignal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Account, AccountField } from '../../../models';
import { Auth } from '../../../auth';
import { seedBskyIdentity } from '../../../testing/seed-storage';
import { SettingsProfile } from './settings-profile';
import { By } from '@angular/platform-browser';
import { ProfileLinkDialog } from './profile-link-dialog';

interface SettingsProfileInternals {
  displayName: WritableSignal<string>;
  username: WritableSignal<string>;
  note: WritableSignal<string>;
  fields: WritableSignal<AccountField[]>;
  saving: WritableSignal<boolean>;
  saved: WritableSignal<boolean>;
  saveProfile(): void;
}

function internals(fixture: ComponentFixture<SettingsProfile>): SettingsProfileInternals {
  return fixture.componentInstance as unknown as SettingsProfileInternals;
}

function makeAccount(): Account {
  return {
    id: '1',
    username: 'alice',
    acct: 'alice',
    display_name: 'Alice',
    note: 'plain note',
    url: '',
    avatar: '',
    avatar_static: '',
    header: '',
    followers_count: 0,
    following_count: 0,
    statuses_count: 0,
    bot: false,
    locked: false,
    fields: [],
    source: {
      privacy: 'public',
      sensitive: false,
      language: null,
      note: 'source note',
      fields: [{ name: 'Web', value: 'example.com' }],
    },
  };
}

describe('SettingsProfile', () => {
  let httpMock: HttpTestingController;
  const modalDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'showModal');
  const closeDescriptor = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, 'close');

  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value() {
        this.open = true;
      },
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value() {
        this.open = false;
      },
    });
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
    for (const [name, descriptor] of [
      ['showModal', modalDescriptor],
      ['close', closeDescriptor],
    ] as const) {
      if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
      else delete (HTMLDialogElement.prototype as unknown as Record<string, unknown>)[name];
    }
  });

  function setUp(): ComponentFixture<SettingsProfile> {
    const fixture = TestBed.createComponent(SettingsProfile);
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/accounts/verify_credentials').flush(makeAccount());
    return fixture;
  }

  it('loads the profile from source fields', () => {
    const fixture = setUp();
    const c = internals(fixture);
    expect(c.displayName()).toBe('Alice');
    expect(c.note()).toBe('source note');
    expect(c.fields()).toEqual([{ name: 'Web', value: 'example.com' }]);
  });

  it('adds a guided link to a blank row and only publishes it when Save changes is chosen', () => {
    const fixture = setUp();
    const c = internals(fixture);
    c.fields.set([
      { name: '', value: '' },
      { name: 'Pronouns', value: 'she/her' },
    ]);
    fixture.detectChanges();
    const button: HTMLButtonElement = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button'),
    ).find((button) => button.textContent?.trim() === 'Add a link')!;
    button.click();
    fixture.detectChanges();
    const dialog = fixture.debugElement.query(By.directive(ProfileLinkDialog))
      .componentInstance as ProfileLinkDialog;
    dialog.added.emit({ name: 'My website', value: 'https://example.com/' });
    fixture.detectChanges();
    expect(c.fields()).toEqual([
      { name: 'My website', value: 'https://example.com/' },
      { name: 'Pronouns', value: 'she/her' },
    ]);
    expect(fixture.debugElement.query(By.directive(ProfileLinkDialog))).toBeNull();
    httpMock.expectNone('/api/v1/accounts/update_credentials');
    c.saveProfile();
    const req = httpMock.expectOne('/api/v1/accounts/update_credentials');
    expect((req.request.body as FormData).get('fields_attributes[0][value]')).toBe(
      'https://example.com/',
    );
    req.flush(makeAccount());
  });

  it('opens both helpers at the field limit but only allows adding after a row is removed', () => {
    const fixture = setUp();
    internals(fixture).fields.set(
      Array.from({ length: 4 }, (_, i) => ({
        name: `Link ${i}`,
        value: `https://example.com/${i}`,
      })),
    );
    fixture.detectChanges();
    const buttons: HTMLButtonElement[] = Array.from(
      fixture.nativeElement.querySelectorAll('.link-actions button'),
    );
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => !button.disabled)).toBe(true);
    for (const [index, mode] of ['link', 'profile'].entries()) {
      buttons[index].click();
      fixture.detectChanges();
      const dialog = fixture.debugElement.query(By.directive(ProfileLinkDialog))
        .componentInstance as ProfileLinkDialog;
      expect(dialog.mode()).toBe(mode);
      expect(dialog.canAdd()).toBe(false);
      expect(fixture.nativeElement.querySelector('dialog button[type="submit"]').disabled).toBe(
        true,
      );
      expect(fixture.nativeElement.querySelector('dialog').textContent).toContain(
        'cancel and remove a row',
      );
      dialog.added.emit({ name: 'Extra', value: 'https://example.com/extra' });
      expect(internals(fixture).fields()).toHaveLength(4);
      dialog.closed.emit();
      fixture.detectChanges();
    }
    fixture.componentInstance.removeField(0);
    fixture.detectChanges();
    expect(buttons.every((button) => !button.disabled)).toBe(true);
    buttons[1].click();
    fixture.detectChanges();
    expect(
      fixture.debugElement.query(By.directive(ProfileLinkDialog)).componentInstance.mode(),
    ).toBe('profile');
    expect(
      fixture.debugElement.query(By.directive(ProfileLinkDialog)).componentInstance.canAdd(),
    ).toBe(true);
    expect(fixture.nativeElement.querySelector('dialog button[type="submit"]').disabled).toBe(
      false,
    );
  });

  it('keeps metadata rows compact with accessible labels and a single pair of helper buttons', () => {
    const fixture = setUp();
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const labels = el.querySelectorAll<HTMLLabelElement>('.meta-row label');
    expect(labels).toHaveLength(2);
    for (const label of labels) {
      expect(label.classList.contains('mb-field-label-hidden')).toBe(true);
      expect(label.control).toBeTruthy();
    }
    expect(el.querySelectorAll('.link-actions button')).toHaveLength(2);
  });

  it('saves via PATCH update_credentials with form data', () => {
    const fixture = setUp();
    const c = internals(fixture);
    c.displayName.set('Alice B.');
    c.saveProfile();

    const req = httpMock.expectOne('/api/v1/accounts/update_credentials');
    expect(req.request.method).toBe('PATCH');
    const body = req.request.body as FormData;
    expect(body.get('display_name')).toBe('Alice B.');
    req.flush(makeAccount());
    expect(c.saved()).toBe(true);
    expect(c.saving()).toBe(false);
  });

  it('loads and saves Anonymous profiles locally without authenticated API calls', async () => {
    const auth = TestBed.inject(Auth);
    auth.enterAnonymous('https://mastodon.art');
    const fixture = TestBed.createComponent(SettingsProfile);
    fixture.detectChanges();
    const c = internals(fixture);

    expect(c.displayName()).toBe('Anonymous');
    expect(c.username()).toBe('mastodon.art');
    c.displayName.set('Demo Demoson');
    c.username.set('demo');
    c.note.set('Local profile');
    c.saveProfile();
    await fixture.whenStable();

    expect(auth.account()?.display_name).toBe('Demo Demoson');
    expect(auth.account()?.username).toBe('demo');
    expect(c.saved()).toBe(true);
    expect(c.saving()).toBe(false);
  });

  it('loads and safely updates a Bluesky-primary profile without calling Mastodon', async () => {
    seedBskyIdentity({ did: 'did:plc:alice', handle: 'alice.bsky.social' });
    const auth = TestBed.inject(Auth);
    expect(auth.enterBluesky()).toBe(true);
    const fixture = TestBed.createComponent(SettingsProfile);
    fixture.detectChanges();

    const profile = httpMock.expectOne((request) =>
      request.url.endsWith('/xrpc/app.bsky.actor.getProfile'),
    );
    profile.flush({
      did: 'did:plc:alice',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
      description: 'Raw Bluesky bio',
    });
    const c = internals(fixture);
    expect(c.note()).toBe('Raw Bluesky bio');
    c.displayName.set('Alice B.');
    c.note.set('Updated bio');
    c.saveProfile();

    const getRecord = httpMock.expectOne((request) =>
      request.url.endsWith('/xrpc/com.atproto.repo.getRecord'),
    );
    getRecord.flush({
      uri: 'at://did:plc:alice/app.bsky.actor.profile/self',
      cid: 'old-cid',
      value: {
        $type: 'app.bsky.actor.profile',
        displayName: 'Alice',
        pinnedPost: { uri: 'at://did:plc:alice/app.bsky.feed.post/1' },
      },
    });

    await fixture.whenStable();
    const put = httpMock.expectOne((request) =>
      request.url.endsWith('/xrpc/com.atproto.repo.putRecord'),
    );
    expect(put.request.body).toMatchObject({
      repo: 'did:plc:alice',
      collection: 'app.bsky.actor.profile',
      rkey: 'self',
      swapRecord: 'old-cid',
      record: {
        displayName: 'Alice B.',
        description: 'Updated bio',
        pinnedPost: { uri: 'at://did:plc:alice/app.bsky.feed.post/1' },
      },
    });
    put.flush({ uri: 'at://did:plc:alice/app.bsky.actor.profile/self', cid: 'new-cid' });
    await fixture.whenStable();

    expect(c.saved()).toBe(true);
    expect(c.saving()).toBe(false);
    expect(auth.account()?.display_name).toBe('Alice B.');
    expect(httpMock.match('/api/v1/accounts/update_credentials')).toHaveLength(0);
  });
});
