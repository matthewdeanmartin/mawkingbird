import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth';
import { Status } from '../../models';
import { MISSKEY_PERMISSIONS } from './misskey-auth';
import { MisskeyCompose } from './misskey-compose';
import { saveMisskeyIdentity } from './misskey-identity-store';
import { MkNote } from './misskey-types';

const SERVER = 'https://misskey.design';
const api = (endpoint: string) => `${SERVER}/api/${endpoint}`;

const created = (extra: Partial<MkNote> = {}): MkNote => ({
  id: 'new',
  createdAt: '2026-11-09T12:00:00.000Z',
  text: 'hello',
  user: { id: 'u1', name: null, username: 'me', host: null, avatarUrl: null },
  userId: 'u1',
  visibility: 'public',
  ...extra,
});

interface ComposeInternals {
  text: { set(v: string): void };
  cwOn: { set(v: boolean): void };
  cw: { set(v: string): void };
  visibility: { set(v: string): void; (): string };
  localOnly: { set(v: boolean): void };
  files: { set(v: unknown[]): void };
  needsApproval(): boolean;
  error(): string | null;
  submit(): Promise<void>;
}

describe('MisskeyCompose', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    const key = saveMisskeyIdentity(
      { server: SERVER, userId: 'u1', username: 'me', name: null, avatarUrl: null },
      { token: 'tok', permissions: [...MISSKEY_PERMISSIONS] },
    );
    TestBed.inject(Auth).enterMisskey(key);
  });
  afterEach(() => localStorage.clear());

  function setUp(inputs: { replyTo?: Status; quote?: Status } = {}): {
    fixture: ComponentFixture<MisskeyCompose>;
    c: ComposeInternals;
  } {
    const fixture = TestBed.createComponent(MisskeyCompose);
    if (inputs.replyTo) fixture.componentRef.setInput('replyTo', inputs.replyTo);
    if (inputs.quote) fixture.componentRef.setInput('quote', inputs.quote);
    fixture.detectChanges();
    http.expectOne(api('meta')).flush({ maxNoteTextLength: 3000 });
    return { fixture, c: fixture.componentInstance as unknown as ComposeInternals };
  }

  it('posts a note with its CW, visibility and local-only choice, and emits it', async () => {
    const { fixture, c } = setUp();
    const posted: Status[] = [];
    fixture.componentInstance.posted.subscribe((s) => posted.push(s));
    c.text.set('hello');
    c.cwOn.set(true);
    c.cw.set('spoiler');
    c.visibility.set('home');
    c.localOnly.set(true);
    const done = c.submit();
    const req = await vi.waitFor(() => http.expectOne(api('notes/create')));
    expect(req.request.body).toEqual({
      visibility: 'home',
      text: 'hello',
      cw: 'spoiler',
      localOnly: true,
      i: 'tok',
    });
    req.flush({ createdNote: created({ cw: 'spoiler', visibility: 'home' }) });
    await done;
    expect(posted.map((s) => s.id)).toEqual(['mk:new']);
  });

  it('replies within the parent’s visibility and carries its CW', async () => {
    const parent = {
      id: 'mk:p1',
      provider: 'misskey',
      providerRef: { server: SERVER, noteId: 'p1' },
      visibility: 'private',
      spoiler_text: 'cw',
    } as unknown as Status;
    const { c } = setUp({ replyTo: parent });
    expect(c.visibility()).toBe('followers');
    c.text.set('reply');
    const done = c.submit();
    const req = await vi.waitFor(() => http.expectOne(api('notes/create')));
    expect(req.request.body).toMatchObject({ replyId: 'p1', visibility: 'followers', cw: 'cw' });
    req.flush({ createdNote: created({ replyId: 'p1' }) });
    await done;
  });

  it('quotes with renoteId', async () => {
    const quoted = {
      id: 'mk:q1',
      provider: 'misskey',
      providerRef: { server: SERVER, noteId: 'q1' },
      visibility: 'public',
    } as unknown as Status;
    const { c } = setUp({ quote: quoted });
    c.text.set('look');
    const done = c.submit();
    const req = await vi.waitFor(() => http.expectOne(api('notes/create')));
    expect(req.request.body).toMatchObject({ renoteId: 'q1', text: 'look' });
    req.flush({ createdNote: created() });
    await done;
  });

  it('uploads attachments to the Drive before posting, with their alt text', async () => {
    const { c } = setUp();
    c.files.set([
      {
        file: new File(['x'], 'cat.png', { type: 'image/png' }),
        preview: 'blob:x',
        alt: 'a cat',
        sensitive: false,
      },
    ]);
    const done = c.submit();
    const upload = await vi.waitFor(() => http.expectOne(api('drive/files/create')));
    expect((upload.request.body as FormData).get('comment')).toBe('a cat');
    upload.flush({ id: 'f1' });
    const create = await vi.waitFor(() => http.expectOne(api('notes/create')));
    expect(create.request.body.fileIds).toEqual(['f1']);
    create.flush({ createdNote: created() });
    await done;
  });

  it('asks for one more approval when the token cannot write', async () => {
    const { c } = setUp();
    c.text.set('hello');
    const done = c.submit();
    (await vi.waitFor(() => http.expectOne(api('notes/create')))).flush(
      { error: { code: 'PERMISSION_DENIED' } },
      { status: 403, statusText: 'Forbidden' },
    );
    await done;
    expect(c.needsApproval()).toBe(true);
    expect(c.error()).toBeNull();
  });
});
