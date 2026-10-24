import { WritableSignal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDialogs } from '../app-dialogs';
import { FollowTrust } from '../follow-trust';
import { Status } from '../models';
import { adaptPost } from '../providers/bluesky/bluesky-adapter';
import { BlueskyApi } from '../providers/bluesky/bluesky-api';
import { BlueskySession } from '../providers/bluesky/bluesky-session';
import { BskyImagesEmbed, BskyPostView } from '../providers/bluesky/bluesky-types';
import { seedBskyIdentity } from '../testing/seed-storage';
import { StatusCard } from './status-card';

interface EditorState {
  editText: WritableSignal<string>;
  editing: WritableSignal<boolean>;
  saving: WritableSignal<boolean>;
}

const endpoint = (method: string) => `https://bsky.social/xrpc/${method}`;
const event = () => new Event('click');

describe('Bluesky post lifecycle through the API and status card', () => {
  let http: HttpTestingController;
  let api: BlueskyApi;
  let card: ComponentFixture<StatusCard>;
  let post: BskyPostView;
  let deleted: Status[];
  const editor = () => card.componentInstance as unknown as EditorState;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    seedBskyIdentity({ did: 'did:plc:me', handle: 'me.bsky.social' });
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(BlueskyApi);
    TestBed.inject(BlueskySession).session.set({
      did: 'did:plc:me',
      handle: 'me.bsky.social',
      service: 'https://bsky.social',
      accessJwt: 'lifecycle-jwt',
      refreshJwt: 'lifecycle-refresh',
    });
    vi.spyOn(FollowTrust.prototype, 'isMutual').mockReturnValue(false);
    vi.spyOn(AppDialogs.prototype, 'confirm').mockResolvedValue(true);
    deleted = [];
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  function mount(view: BskyPostView): void {
    card?.destroy();
    post = view;
    card = TestBed.createComponent(StatusCard);
    card.componentRef.setInput('status', adaptPost(post));
    card.componentInstance.changed.subscribe((updated) =>
      card.componentRef.setInput('status', updated),
    );
    card.componentInstance.deleted.subscribe((removed) => deleted.push(removed));
    card.detectChanges();
  }

  function create(withImages = false): void {
    const embed: BskyImagesEmbed = {
      $type: 'app.bsky.embed.images',
      images: ['North', 'East', 'South', 'West'].map((alt, index) => ({
        alt,
        image: {
          $type: 'blob',
          ref: { $link: `blob-${index}` },
          mimeType: 'image/jpeg',
          size: 123,
        },
        aspectRatio: { width: 640, height: 480 },
      })),
    };
    const record = {
      text: 'Original caption',
      langs: ['en'],
      labels: { $type: 'com.atproto.label.defs#selfLabels', values: [{ val: 'nudity' }] },
      reply: {
        root: { uri: 'root', cid: 'root-cid' },
        parent: { uri: 'parent', cid: 'parent-cid' },
      },
      ...(withImages ? { embed } : {}),
    };
    api.post(record).subscribe((result) =>
      mount({
        ...result,
        author: { did: 'did:plc:me', handle: 'me.bsky.social' },
        indexedAt: '2026-10-24T12:00:00Z',
        record: { $type: 'app.bsky.feed.post', createdAt: '2026-10-24T12:00:00Z', ...record },
      }),
    );
    const request = http.expectOne(endpoint('com.atproto.repo.createRecord'));
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toMatchObject({
      repo: 'did:plc:me',
      collection: 'app.bsky.feed.post',
      record,
    });
    request.flush({ uri: 'at://did:plc:me/app.bsky.feed.post/original', cid: 'original-cid' });
  }

  function openEdit(): void {
    card.componentInstance.startEdit(event());
    const source = http.expectOne((request) => request.url === endpoint('app.bsky.feed.getPosts'));
    expect(source.request.method).toBe('GET');
    expect(source.request.params.getAll('uris')).toEqual([post.uri]);
    source.flush({ posts: [post] });
    expect(editor().editText()).toBe(post.record.text);
  }

  async function startSave(text: string): Promise<void> {
    editor().editText.set(text);
    card.componentInstance.saveEdit();
    const refresh = http.expectOne((request) => request.url === endpoint('app.bsky.feed.getPosts'));
    refresh.flush({ posts: [post] });
    await vi.waitFor(() => expect(AppDialogs.prototype.confirm).toHaveBeenCalled());
  }

  async function replacementRequest(text: string) {
    await startSave(text);
    let request: ReturnType<HttpTestingController['expectOne']> | undefined;
    await vi.waitFor(() => {
      const requests = http.match(endpoint('com.atproto.repo.applyWrites'));
      expect(requests).toHaveLength(1);
      request = requests[0];
    });
    expect(request!.request.method).toBe('POST');
    expect(request!.request.body.writes).toHaveLength(2);
    const [create, remove] = request!.request.body.writes;
    expect(create).toMatchObject({
      $type: 'com.atproto.repo.applyWrites#create',
      collection: 'app.bsky.feed.post',
      value: { ...post.record, text, createdAt: expect.any(String), facets: expect.any(Array) },
    });
    expect(remove).toEqual({
      $type: 'com.atproto.repo.applyWrites#delete',
      collection: 'app.bsky.feed.post',
      rkey: post.uri.split('/').at(-1),
    });
    http.expectNone(endpoint('com.atproto.repo.deleteRecord'));
    return request!;
  }

  it('create four images -> replace -> replace preserves blobs, alt text, labels and reply context', async () => {
    create(true);
    const identities = [post.uri];
    for (const text of ['First correction', 'Second correction']) {
      openEdit();
      const oldPost = post;
      const request = await replacementRequest(text);
      const replacement = request.request.body.writes[0];
      request.flush({});
      await vi.waitFor(() => expect(editor().editing()).toBe(false));
      expect(deleted.at(-1)?.id).toBe(`bsky:${oldPost.uri}`);
      // Feed refresh returns the newly created record; the next edit must use it.
      mount({
        ...oldPost,
        uri: `at://did:plc:me/app.bsky.feed.post/${replacement.rkey}`,
        cid: `cid-${text}`,
        record: replacement.value,
      });
      identities.push(post.uri);
    }
    expect(new Set(identities).size).toBe(3);
    expect(deleted).toHaveLength(2);
  });

  it('create -> repost -> undo repost uses the repost ID without deleting the original', () => {
    create();
    card.componentInstance.toggleReblog(event());
    const request = http.expectOne(endpoint('com.atproto.repo.createRecord'));
    expect(request.request.body).toMatchObject({
      collection: 'app.bsky.feed.repost',
      record: { subject: { uri: post.uri, cid: post.cid } },
    });
    request.flush({ uri: 'at://did:plc:me/app.bsky.feed.repost/repost-1', cid: 'repost-cid' });
    card.detectChanges();
    expect(card.componentInstance.display.reblogged).toBe(true);
    card.componentInstance.toggleReblog(event());
    const undo = http.expectOne(endpoint('com.atproto.repo.deleteRecord'));
    expect(undo.request.body).toEqual({
      repo: 'did:plc:me',
      collection: 'app.bsky.feed.repost',
      rkey: 'repost-1',
    });
    undo.flush({});
    card.detectChanges();
    expect(card.componentInstance.display.id).toBe(`bsky:${post.uri}`);
    expect(card.componentInstance.display.reblogged).toBe(false);
    expect(deleted).toEqual([]);
  });

  it('create -> delete removes the original only after server success', async () => {
    create();
    await card.componentInstance.remove(event());
    const request = http.expectOne(endpoint('com.atproto.repo.deleteRecord'));
    expect(request.request.body).toEqual({
      repo: 'did:plc:me',
      collection: 'app.bsky.feed.post',
      rkey: 'original',
    });
    expect(deleted).toEqual([]);
    request.flush({});
    expect(deleted.map((item) => item.id)).toEqual([`bsky:${post.uri}`]);
  });

  it('create -> failed replacement -> retry keeps the same transaction identity and original images', async () => {
    create(true);
    openEdit();
    const failed = await replacementRequest('Retry correction');
    const key = failed.request.body.writes[0].rkey;
    failed.flush({}, { status: 503, statusText: 'Unavailable' });
    await vi.waitFor(() => expect(editor().saving()).toBe(false));
    expect(editor().editing()).toBe(true);
    expect(editor().editText()).toBe('Retry correction');
    expect(deleted).toEqual([]);
    const retry = await replacementRequest('Retry correction');
    expect(retry.request.body.writes[0].rkey).toBe(key);
    retry.flush({});
    await vi.waitFor(() => expect(deleted).toHaveLength(1));
  });

  it('create -> changed source while editing refuses to replace a newer version', async () => {
    create(true);
    openEdit();
    editor().editText.set('Stale correction');
    card.componentInstance.saveEdit();
    http
      .expectOne((request) => request.url === endpoint('app.bsky.feed.getPosts'))
      .flush({
        posts: [{ ...post, cid: 'changed-elsewhere' }],
      });
    await vi.waitFor(() => expect(editor().saving()).toBe(false));
    expect(editor().editing()).toBe(true);
    expect(deleted).toEqual([]);
    expect(AppDialogs.prototype.confirm).not.toHaveBeenCalled();
    http.expectNone(endpoint('com.atproto.repo.applyWrites'));
  });
});
