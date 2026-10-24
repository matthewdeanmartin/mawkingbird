import { WritableSignal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController } from '@angular/common/http/testing';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppDialogs } from '../app-dialogs';
import { Auth } from '../auth';
import { Compose } from '../compose/compose';
import { FollowTrust } from '../follow-trust';
import { Account, MediaAttachment, Poll, Status } from '../models';
import { StatusCard } from './status-card';

interface ComposerState {
  text: WritableSignal<string>;
  visibility: WritableSignal<string>;
  cwOpen: WritableSignal<boolean>;
  spoilerText: WritableSignal<string>;
  sensitive: WritableSignal<boolean>;
  pollOpen: WritableSignal<boolean>;
  pollOptions: WritableSignal<string[]>;
  pollMultiple: WritableSignal<boolean>;
  pollExpiresIn: WritableSignal<number>;
  media: WritableSignal<{ media: MediaAttachment; description: string }[]>;
  submit(): Promise<void>;
}

interface EditorState {
  editing: WritableSignal<boolean>;
  editText: WritableSignal<string>;
  saving: WritableSignal<boolean>;
  actionError: WritableSignal<string | null>;
}

const author: Account = {
  id: 'author',
  username: 'alice',
  acct: 'alice',
  display_name: 'Alice',
  note: '',
  url: 'https://social.test/@alice',
  avatar: '',
  avatar_static: '',
  header: '',
  followers_count: 0,
  following_count: 0,
  statuses_count: 0,
  bot: false,
  locked: false,
  fields: [],
};

function status(overrides: Partial<Status> = {}): Status {
  return {
    id: 'published-1',
    created_at: '2026-10-24T12:00:00Z',
    edited_at: null,
    content: '<p>Original caption</p>',
    spoiler_text: '',
    visibility: 'public',
    url: 'https://social.test/@alice/published-1',
    account: author,
    reblog: null,
    quote: null,
    in_reply_to_id: null,
    replies_count: 0,
    reblogs_count: 0,
    favourites_count: 0,
    favourited: false,
    reblogged: false,
    bookmarked: false,
    muted: false,
    pinned: false,
    sensitive: false,
    poll: null,
    quote_approval_policy: null,
    media_attachments: [],
    ...overrides,
  };
}

function images(): MediaAttachment[] {
  return ['North bird', 'East bird', 'South bird', 'West bird'].map((description, index) => ({
    id: `image-${index}`,
    type: 'image',
    description,
    url: `https://cdn.test/${index}.jpg`,
    preview_url: `https://cdn.test/${index}-thumb.jpg`,
  }));
}

function poll(multiple = false, expired = false): Poll {
  return {
    id: 'poll-1',
    expires_at: '2026-10-25T12:00:00Z',
    expired,
    multiple,
    votes_count: 7,
    voters_count: 7,
    voted: true,
    own_votes: [1],
    options: [
      { title: 'Birds', votes_count: 3 },
      { title: 'Bees', votes_count: 4 },
    ],
  };
}

/**
 * Component lifecycle contracts, not a simulated Mastodon implementation.
 * Real Compose -> HTTP -> posted -> StatusCard -> HTTP -> changed/deleted.
 * Responses are independent fixtures; every mutation's request is checked BEFORE
 * flushing its response, so a response containing media cannot conceal data loss.
 * changed is fed back into the card as a timeline parent would do. In particular,
 * a second edit must fetch the latest source and operate on the latest post.
 */
describe('Post lifecycle through composer and status card', () => {
  let http: HttpTestingController;
  let composer: ComponentFixture<Compose>;
  let draft: ComposerState;
  let card: ComponentFixture<StatusCard>;
  let current: Status;
  let removed: Status[];
  let changes: Status[];
  let publications: Status[];

  const event = () => new Event('click');
  const editor = () => card.componentInstance as unknown as EditorState;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
    http = TestBed.inject(HttpTestingController);
    TestBed.inject(Auth).token.set('lifecycle-token');
    vi.spyOn(FollowTrust.prototype, 'isMutual').mockReturnValue(false);
    vi.spyOn(AppDialogs.prototype, 'confirm').mockResolvedValue(true);
    composer = TestBed.createComponent(Compose);
    composer.detectChanges();
    draft = composer.componentInstance as unknown as ComposerState;
    removed = [];
    changes = [];
    publications = [];
    composer.componentInstance.posted.subscribe((created) => {
      publications.push(created);
      current = created;
      card = TestBed.createComponent(StatusCard);
      card.componentRef.setInput('status', created);
      card.componentInstance.changed.subscribe((updated) => {
        changes.push(updated);
        current = updated;
        card.componentRef.setInput('status', updated);
      });
      card.componentInstance.deleted.subscribe((deleted) => removed.push(deleted));
      card.detectChanges();
    });
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  async function create(expected = status(), text = 'Original caption'): Promise<void> {
    draft.text.set(text);
    draft.visibility.set(expected.visibility);
    draft.cwOpen.set(!!expected.spoiler_text);
    draft.spoilerText.set(expected.spoiler_text);
    draft.sensitive.set(expected.sensitive);
    draft.media.set(
      expected.media_attachments.map((media) => ({ media, description: media.description ?? '' })),
    );
    if (expected.poll) {
      draft.pollOpen.set(true);
      draft.pollOptions.set(expected.poll.options.map((option) => option.title));
      draft.pollMultiple.set(expected.poll.multiple);
      draft.pollExpiresIn.set(86400);
    }
    await draft.submit();
    for (const media of expected.media_attachments) {
      const description = http.expectOne(`/api/v1/media/${media.id}`);
      expect(description.request.method).toBe('PUT');
      expect(description.request.body).toEqual({ description: media.description });
      description.flush(media);
    }
    const request = http.expectOne('/api/v1/statuses');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toMatchObject({ status: text, visibility: expected.visibility });
    expect(request.request.body.media_ids ?? []).toEqual(
      expected.media_attachments.map((media) => media.id),
    );
    expect(request.request.body.spoiler_text ?? '').toBe(expected.spoiler_text);
    expect(request.request.body.sensitive ?? false).toBe(expected.sensitive);
    expect(request.request.body.in_reply_to_id ?? null).toBe(expected.in_reply_to_id);
    if (expected.poll) {
      expect(request.request.body.poll).toEqual({
        options: expected.poll.options.map((option) => option.title),
        multiple: expected.poll.multiple,
        expires_in: 86400,
      });
    }
    request.flush(expected);
    expect(current).toEqual(expected);
    expect(draft.text()).toBe('');
    expect(draft.media()).toEqual([]);
  }

  function openEdit(source: string): void {
    card.componentInstance.startEdit(event());
    const request = http.expectOne(`/api/v1/statuses/${current.id}/source`);
    expect(request.request.method).toBe('GET');
    request.flush({ id: current.id, text: source, spoiler_text: current.spoiler_text });
    expect(editor().editText()).toBe(source);
    expect(editor().editing()).toBe(true);
  }

  function saveRequest(text: string) {
    editor().editText.set(text);
    card.componentInstance.saveEdit();
    const request = http.expectOne(`/api/v1/statuses/${current.id}`);
    expect(request.request.method).toBe('PUT');
    // Exact payload protects CW, sensitivity and poll votes from accidental
    // empty/default replacements. Existing attachment IDs must remain ordered.
    expect(request.request.body).toEqual({
      status: text,
      media_ids: current.media_attachments.map((media) => media.id),
    });
    return request;
  }

  function edit(before: string, after: string): void {
    const previous = current;
    openEdit(before);
    const request = saveRequest(after);
    expect(editor().saving()).toBe(true);
    expect(current).toBe(previous);
    const updated = { ...previous, content: `<p>${after}</p>`, edited_at: '2026-10-24T13:00:00Z' };
    request.flush(updated);
    card.detectChanges();
    expect(current).toEqual(updated);
    expect(card.componentInstance.display).toEqual(updated);
    expect(editor().saving()).toBe(false);
    expect(editor().editing()).toBe(false);
    expect(removed).toEqual([]);
  }

  it('create -> boost -> unboost keeps the original post rather than the boost wrapper', async () => {
    await create();
    card.componentInstance.toggleReblog(event());
    const boost = http.expectOne(`/api/v1/statuses/${current.id}/reblog`);
    expect(boost.request.method).toBe('POST');
    expect(boost.request.body).toEqual({});
    boost.flush(
      status({ id: 'boost-wrapper', reblog: { ...current, reblogged: true, reblogs_count: 1 } }),
    );
    card.detectChanges();
    expect(current.id).toBe('published-1');
    expect(current.reblogged).toBe(true);
    expect(current.reblog).toBeNull();
    card.componentInstance.toggleReblog(event());
    const undo = http.expectOne('/api/v1/statuses/published-1/unreblog');
    expect(undo.request.method).toBe('POST');
    undo.flush({ ...current, reblogged: false, reblogs_count: 0 });
    expect(current.reblogged).toBe(false);
    expect(current.content).toBe('<p>Original caption</p>');
  });

  it('create -> edit preserves the post identity and updates the card', async () => {
    await create();
    edit('Original caption', 'Corrected caption');
    expect(changes).toHaveLength(1);
    expect(card.nativeElement.querySelector('.content').textContent).toContain('Corrected caption');
  });

  it('create -> edit -> edit starts the second edit from the saved source', async () => {
    await create();
    edit('Original caption', 'First correction');
    edit('First correction', 'Second correction');
    expect(changes.map((item) => item.content)).toEqual([
      '<p>First correction</p>',
      '<p>Second correction</p>',
    ]);
    expect(changes.every((item) => item.id === 'published-1')).toBe(true);
  });

  it.each([false, true])(
    'create -> optional edit (%s) -> delete removes the latest version only after success',
    async (edited) => {
      await create();
      if (edited) edit('Original caption', 'Corrected caption');
      await card.componentInstance.remove(event());
      const request = http.expectOne(`/api/v1/statuses/${current.id}`);
      expect(request.request.method).toBe('DELETE');
      expect(removed).toEqual([]);
      request.flush(current);
      expect(removed).toEqual([current]);
      expect(removed[0].content).toBe(
        edited ? '<p>Corrected caption</p>' : '<p>Original caption</p>',
      );
    },
  );

  it.each([
    [false, false],
    [true, false],
    [false, true],
  ])(
    'create poll (multiple=%s, expired=%s) -> edit preserves options, votes and deadline',
    async (multiple, expired) => {
      const originalPoll = poll(multiple, expired);
      await create(status({ poll: originalPoll }));
      edit('Original caption', 'Clearer poll question');
      edit('Clearer poll question', 'Final poll question');
      expect(current.poll).toEqual(originalPoll);
      expect(card.nativeElement.querySelector('.poll').textContent).toContain('Birds');
      http.expectNone((request) => request.url.includes('/polls/'));
    },
  );

  it('create four images -> edit -> edit preserves order, URLs and every alt text', async () => {
    const media = images();
    await create(status({ media_attachments: media }));
    edit('Original caption', 'First correction');
    edit('First correction', 'Second correction');
    expect(current.media_attachments).toEqual(media);
    const rendered = [
      ...card.nativeElement.querySelectorAll('.media-thumb img'),
    ] as HTMLImageElement[];
    expect(rendered.map((image) => image.alt)).toEqual(media.map((image) => image.description));
    expect(rendered).toHaveLength(4);
  });

  it.each(['warning', 'sensitive images', 'warning and images'])(
    'create %s -> edit retains content protection',
    async (kind) => {
      const original = status({
        spoiler_text: kind === 'sensitive images' ? '' : 'Bird spoilers',
        sensitive: true,
        media_attachments: kind === 'warning' ? [] : images(),
      });
      await create(original);
      edit('Original caption', 'Corrected caption');
      expect(current.spoiler_text).toBe(original.spoiler_text);
      expect(current.sensitive).toBe(true);
      expect(current.media_attachments).toEqual(original.media_attachments);
    },
  );

  it.each(['private', 'direct', 'unlisted'])(
    'create %s post -> edit never republishes it publicly',
    async (visibility) => {
      await create(status({ visibility }));
      edit('Original caption', 'Corrected caption');
      expect(current.visibility).toBe(visibility);
      http.expectNone('/api/v1/statuses');
    },
  );

  it('create reply -> edit keeps its parent and original language', async () => {
    composer.componentRef.setInput('inReplyToId', 'parent-post');
    composer.detectChanges();
    await create(status({ in_reply_to_id: 'parent-post', language: 'en' }));
    edit('Original caption', 'Corrected reply');
    expect(current.in_reply_to_id).toBe('parent-post');
    expect(current.language).toBe('en');
  });

  it('create -> cancel edit -> reopen uses the saved source, never the discarded text', async () => {
    await create(status({ media_attachments: images() }));
    openEdit('Original caption');
    editor().editText.set('Discard this');
    card.componentInstance.cancelEdit();
    expect(editor().editing()).toBe(false);
    expect(changes).toEqual([]);
    expect(current.content).toBe('<p>Original caption</p>');
    edit('Original caption', 'Keep this');
  });

  it('create -> failed edit -> retry keeps the editor, text and attachments until success', async () => {
    await create(status({ media_attachments: images() }));
    const original = current;
    openEdit('Original caption');
    saveRequest('Retry this caption').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(editor().editing()).toBe(true);
    expect(editor().saving()).toBe(false);
    expect(editor().editText()).toBe('Retry this caption');
    expect(current).toBe(original);
    expect(changes).toEqual([]);
    saveRequest('Retry this caption').flush({ ...original, content: '<p>Retry this caption</p>' });
    expect(changes).toHaveLength(1);
    expect(current.media_attachments).toEqual(images());
  });

  it('create -> save twice while pending issues one edit and cannot be cancelled mid-save', async () => {
    await create();
    openEdit('Original caption');
    const request = saveRequest('Corrected caption');
    card.componentInstance.saveEdit();
    card.componentInstance.cancelEdit();
    http.expectNone(`/api/v1/statuses/${current.id}`);
    expect(editor().editing()).toBe(true);
    request.flush({ ...current, content: '<p>Corrected caption</p>' });
    expect(changes).toHaveLength(1);
  });

  it('create -> cancel delete leaves the post and attachments intact', async () => {
    await create(status({ media_attachments: images() }));
    vi.mocked(AppDialogs.prototype.confirm).mockResolvedValue(false);
    await card.componentInstance.remove(event());
    http.expectNone(`/api/v1/statuses/${current.id}`);
    expect(removed).toEqual([]);
    expect(current.media_attachments).toEqual(images());
  });

  it('create -> like -> bookmark -> edit keeps engagement and saved state', async () => {
    await create();
    card.componentInstance.toggleFavourite(event());
    const like = http.expectOne(`/api/v1/statuses/${current.id}/favourite`);
    expect(like.request.method).toBe('POST');
    like.flush({ ...current, favourited: true, favourites_count: 1 });
    card.detectChanges();
    card.componentInstance.toggleBookmark(event());
    const bookmark = http.expectOne(`/api/v1/statuses/${current.id}/bookmark`);
    expect(bookmark.request.method).toBe('POST');
    bookmark.flush({ ...current, bookmarked: true });
    card.detectChanges();
    edit('Original caption', 'Corrected caption');
    expect(current).toMatchObject({ favourited: true, favourites_count: 1, bookmarked: true });
  });

  it('create -> failed boost rolls back optimistic state and allows retry', async () => {
    await create();
    const original = current;
    card.componentInstance.toggleReblog(event());
    http.expectOne(`/api/v1/statuses/${current.id}/reblog`).flush(
      {},
      {
        status: 503,
        statusText: 'Unavailable',
      },
    );
    expect(current).toBe(original);
    expect(changes).toEqual([]);
    card.componentInstance.toggleReblog(event());
    http.expectOne(`/api/v1/statuses/${current.id}/reblog`).flush({
      ...current,
      reblogged: true,
      reblogs_count: 1,
    });
    expect(current.reblogged).toBe(true);
    expect(changes).toHaveLength(1);
  });

  it('failed creation -> retry emits one published post and only then clears the composer', async () => {
    draft.text.set('Original caption');
    await draft.submit();
    http.expectOne('/api/v1/statuses').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(draft.text()).toBe('Original caption');
    expect(publications).toEqual([]);
    await create();
    expect(current.id).toBe('published-1');
    expect(publications).toHaveLength(1);
    expect(changes).toEqual([]);
  });

  it('create image-only post -> add a caption retains all four images', async () => {
    await create(status({ content: '', media_attachments: images() }), '');
    edit('', 'A caption for these birds');
    expect(current.media_attachments).toEqual(images());
  });

  it('create -> blank edit refuses the save and retains the saved post', async () => {
    await create();
    openEdit('Original caption');
    editor().editText.set('   ');
    card.componentInstance.saveEdit();
    http.expectNone(`/api/v1/statuses/${current.id}`);
    expect(changes).toEqual([]);
    expect(editor().editing()).toBe(true);
    expect(current.content).toBe('<p>Original caption</p>');
  });

  it('create -> failed delete -> retry keeps the post and reports the failure', async () => {
    await create(status({ media_attachments: images() }));
    await card.componentInstance.remove(event());
    http.expectOne(`/api/v1/statuses/${current.id}`).flush(
      {},
      {
        status: 503,
        statusText: 'Unavailable',
      },
    );
    expect(removed).toEqual([]);
    expect(current.media_attachments).toEqual(images());
    expect(editor().actionError()).toContain('delete');
    await card.componentInstance.remove(event());
    expect(editor().actionError()).toBeNull();
    http.expectOne(`/api/v1/statuses/${current.id}`).flush(current);
    expect(removed).toEqual([current]);
  });

  it('create poll -> vote -> edit keeps the recorded vote and totals', async () => {
    const empty = {
      ...poll(),
      votes_count: 0,
      voters_count: 0,
      voted: false,
      own_votes: [],
      options: [
        { title: 'Birds', votes_count: 0 },
        { title: 'Bees', votes_count: 0 },
      ],
    };
    await create(status({ poll: empty }));
    card.componentInstance.toggleChoice(1);
    card.componentInstance.submitVote(event());
    const vote = http.expectOne('/api/v1/polls/poll-1/votes');
    expect(vote.request.body).toEqual({ choices: [1] });
    const voted = {
      ...empty,
      voted: true,
      own_votes: [1],
      votes_count: 1,
      voters_count: 1,
      options: [
        { title: 'Birds', votes_count: 0 },
        { title: 'Bees', votes_count: 1 },
      ],
    };
    vote.flush(voted);
    card.detectChanges();
    edit('Original caption', 'Clearer question');
    expect(current.poll).toEqual(voted);
  });

  it.each(['video', 'audio', 'gifv'])(
    'create %s attachment -> edit keeps its URL and description',
    async (type) => {
      const media = {
        ...images()[0],
        type,
        url: `https://cdn.test/clip.${type === 'audio' ? 'mp3' : 'mp4'}`,
      };
      await create(status({ media_attachments: [media] }));
      edit('Original caption', 'Corrected caption');
      expect(current.media_attachments).toEqual([media]);
    },
  );
});
