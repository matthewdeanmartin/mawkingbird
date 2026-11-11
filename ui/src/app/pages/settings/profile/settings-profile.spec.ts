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
import { ProfileBioDialog } from './profile-bio-dialog';

interface SettingsProfileInternals {
  bioDialog: WritableSignal<boolean>;
  bot: WritableSignal<boolean>;
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
    httpMock.expectOne('/api/v1/profile').flush(null, { status: 404, statusText: 'Not Found' });
    return fixture;
  }

  it('loads the profile from source fields', () => {
    const fixture = setUp();
    const c = internals(fixture);
    expect(c.displayName()).toBe('Alice');
    expect(c.note()).toBe('source note');
    expect(c.fields()).toEqual([{ name: 'Web', value: 'example.com' }]);
  });

  it('counts complete emoji in the bio editor and preserves oversized content for editing', async () => {
    const fixture = TestBed.createComponent(ProfileBioDialog);
    fixture.componentRef.setInput('text', '🐟'.repeat(257));
    fixture.componentRef.setInput('limit', 256);
    fixture.detectChanges();
    await fixture.whenStable();
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    const apply = fixture.nativeElement.querySelector(
      '[mbDialogActions] button:last-child',
    ) as HTMLButtonElement;
    expect(textarea.value).toBe('🐟'.repeat(257));
    expect(apply.disabled).toBe(true);
    textarea.value = '🐟'.repeat(256);
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(apply.disabled).toBe(false);
    let applied = '';
    fixture.componentInstance.applied.subscribe((value) => {
      applied = value;
    });
    apply.click();
    expect(applied).toBe('🐟'.repeat(256));
    textarea.value = '<script>alert(1)</script>\nhttps://example.org';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const preview = fixture.nativeElement.querySelector('.bio-preview');
    expect(preview.querySelector('script')).toBeNull();
    expect(preview.textContent).toContain('<script>alert(1)</script>');
    expect(preview.querySelector('a').href).toBe('https://example.org/');
  });

  it('switches bio Edit and Preview tabs without losing edits or selection and applies from Preview', async () => {
    const fixture = TestBed.createComponent(ProfileBioDialog);
    fixture.componentRef.setInput('text', 'Original bio');
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const [edit, preview] = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
    const [editPanel, previewPanel] = [...root.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
    const textarea = root.querySelector('textarea')!;
    expect(edit.getAttribute('aria-selected')).toBe('true');
    expect(previewPanel.hidden).toBe(true);
    textarea.value = 'Updated bio\nhttps://example.org';
    textarea.dispatchEvent(new Event('input'));
    textarea.setSelectionRange(3, 7);
    textarea.dispatchEvent(new Event('select'));
    fixture.detectChanges();
    edit.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(preview);
    expect(editPanel.hidden).toBe(true);
    expect(previewPanel.hidden).toBe(false);
    expect(previewPanel.querySelector('a')?.href).toBe('https://example.org/');
    preview.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    fixture.detectChanges();
    expect(document.activeElement).toBe(edit);
    expect(textarea.value).toBe('Updated bio\nhttps://example.org');
    expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([3, 7]);
    preview.click();
    fixture.detectChanges();
    let applied = '';
    fixture.componentInstance.applied.subscribe((value) => {
      applied = value;
    });
    root.querySelector<HTMLButtonElement>('[mbDialogActions] button:last-child')!.click();
    expect(applied).toBe(textarea.value);
  });

  it('renders the bio and edits plain source in a separate dialog without saving on Apply', async () => {
    const fixture = TestBed.createComponent(SettingsProfile);
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/accounts/verify_credentials')
      .flush({ ...makeAccount(), note: '<p>Visit <a href="https://example.org">my site</a></p>' });
    httpMock.expectOne('/api/v1/profile').flush(null, { status: 404, statusText: 'Not Found' });
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.profile-bio a').href).toBe('https://example.org/');
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    const c = internals(fixture);
    c.bioDialog.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    let dialog = fixture.debugElement.query(By.directive(ProfileBioDialog))
      .componentInstance as ProfileBioDialog;
    expect(dialog.text()).toBe('source note');
    dialog.cancelled.emit();
    fixture.detectChanges();
    expect(c.note()).toBe('source note');
    expect(c.bioDialog()).toBe(false);
    c.bioDialog.set(true);
    fixture.detectChanges();
    dialog = fixture.debugElement.query(By.directive(ProfileBioDialog)).componentInstance;
    dialog.applied.emit('New bio\nhttps://example.net');
    fixture.detectChanges();
    expect(c.note()).toBe('New bio\nhttps://example.net');
    expect(fixture.nativeElement.querySelector('.profile-bio a').href).toBe('https://example.net/');
    httpMock.expectNone('/api/v1/accounts/update_credentials');
    c.saveProfile();
    const save = httpMock.expectOne('/api/v1/accounts/update_credentials');
    expect(save.request.body.get('note')).toBe('New bio\nhttps://example.net');
    save.flush(makeAccount());
  });

  it('loads and saves the server bot flag in both directions', () => {
    const fixture = TestBed.createComponent(SettingsProfile);
    fixture.detectChanges();
    httpMock
      .expectOne('/api/v1/accounts/verify_credentials')
      .flush({ ...makeAccount(), bot: true });
    httpMock.expectOne('/api/v1/profile').flush(null, { status: 404, statusText: 'Not Found' });
    const c = internals(fixture);
    expect(c.bot()).toBe(true);
    for (const bot of [false, true]) {
      c.bot.set(bot);
      c.saveProfile();
      const req = httpMock.expectOne('/api/v1/accounts/update_credentials');
      expect((req.request.body as FormData).get('bot')).toBe(String(bot));
      req.flush({ ...makeAccount(), bot });
      expect(TestBed.inject(Auth).account()?.bot).toBe(bot);
    }
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

  describe('profile images on Mastodon', () => {
    const withImages = () => ({
      ...makeAccount(),
      avatar: 'https://files.example/avatars/me.png',
      header: 'https://files.example/headers/original/missing.png',
    });

    function open(profile: object): ComponentFixture<SettingsProfile> {
      const fixture = TestBed.createComponent(SettingsProfile);
      fixture.detectChanges();
      httpMock.expectOne('/api/v1/accounts/verify_credentials').flush(withImages());
      httpMock.expectOne('/api/v1/profile').flush(profile);
      fixture.detectChanges();
      return fixture;
    }

    function button(fixture: ComponentFixture<SettingsProfile>, label: string) {
      return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === label,
      );
    }

    it('shows the current avatar, treats the default header as none, and hides descriptions on API version 8', () => {
      const fixture = open({ id: '1', avatar: 'a', header: null });
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelectorAll('.image-current')).toHaveLength(1);
      expect(button(fixture, 'Remove avatar')).toBeTruthy();
      expect(button(fixture, 'Remove header')).toBeUndefined();
      expect(el.querySelector('input[data-kind="avatar"]')).toBeNull();
    });

    it('loads image descriptions and saves only the changed one after the profile', async () => {
      const fixture = open({
        id: '1',
        avatar: 'a',
        header: null,
        avatar_description: 'A heron',
        header_description: '',
      });
      await fixture.whenStable();
      fixture.detectChanges();
      const el = fixture.nativeElement as HTMLElement;
      const avatarAlt = el.querySelector<HTMLInputElement>('input[data-kind="avatar"]')!;
      expect(avatarAlt.value).toBe('A heron');
      expect(el.querySelector<HTMLImageElement>('.image-current')!.alt).toBe('A heron');
      const headerAlt = el.querySelector<HTMLInputElement>('input[data-kind="header"]')!;
      headerAlt.value = 'Fog over a harbour ';
      headerAlt.dispatchEvent(new Event('input'));

      internals(fixture).saveProfile();
      httpMock.expectOne('/api/v1/accounts/update_credentials').flush(withImages());
      const patch = httpMock.expectOne('/api/v1/profile');
      expect(patch.request.method).toBe('PATCH');
      expect(patch.request.body).toEqual({ header_description: 'Fog over a harbour' });
      patch.flush({
        id: '1',
        avatar_description: 'A heron',
        header_description: 'Fog over a harbour',
      });
      expect(internals(fixture).saved()).toBe(true);

      internals(fixture).saveProfile();
      httpMock.expectOne('/api/v1/accounts/update_credentials').flush(withImages());
      httpMock.expectNone('/api/v1/profile');
    });

    it('removes the avatar after confirmation and clears its description', () => {
      const fixture = open({
        id: '1',
        avatar: 'a',
        header: null,
        avatar_description: 'A heron',
        header_description: '',
      });
      button(fixture, 'Remove avatar')!.click();
      fixture.detectChanges();
      httpMock.expectNone('/api/v1/profile/avatar');
      (fixture.componentInstance as unknown as { removeImage(k: string): void }).removeImage(
        'avatar',
      );
      const remove = httpMock.expectOne('/api/v1/profile/avatar');
      expect(remove.request.method).toBe('DELETE');
      remove.flush({
        ...withImages(),
        avatar: 'https://files.example/avatars/original/missing.png',
      });
      const clear = httpMock.expectOne('/api/v1/profile');
      expect(clear.request.body).toEqual({ avatar_description: '' });
      clear.flush({ id: '1', avatar_description: '', header_description: '' });
      fixture.detectChanges();
      expect(button(fixture, 'Remove avatar')).toBeUndefined();
      expect((fixture.nativeElement as HTMLElement).querySelector('.image-current')).toBeNull();
    });
  });
});
