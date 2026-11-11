import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaAttachment, Poll, Status } from '../../platform/api/models';
import { StatusEditDialog } from './status-edit-dialog';

interface Internals {
  text: { set(v: string): void };
  language: { set(v: string): void };
  sensitive: { (): boolean; set(v: boolean): void };
  media: () => { id: string; description: string }[];
  poll: () => { options: string[]; multiple: boolean } | null;
  canSave: () => boolean;
  canAddMedia: () => boolean;
  votesReset: () => boolean;
  reopensPoll: () => boolean;
  setDescription(i: number, d: string): void;
  removeMedia(i: number): void;
  addFiles(input: HTMLInputElement): Promise<void>;
  addPoll(): void;
  removePoll(): void;
  setOption(i: number, t: string): void;
  addOption(): void;
  setMultiple(m: boolean): void;
  save(): void;
}

function media(id: string, description = ''): MediaAttachment {
  return {
    id,
    type: 'image',
    url: `https://cdn/${id}`,
    preview_url: `https://cdn/${id}s`,
    description,
  };
}

function poll(overrides: Partial<Poll> = {}): Poll {
  return {
    id: 'p1',
    expires_at: new Date(Date.now() + 7200_000).toISOString(),
    expired: false,
    multiple: false,
    votes_count: 4,
    voters_count: 4,
    options: [
      { title: 'Tea', votes_count: 3 },
      { title: 'Coffee', votes_count: 1 },
    ],
    voted: false,
    own_votes: [],
    ...overrides,
  } as Poll;
}

function status(overrides: Partial<Status> = {}): Status {
  return {
    id: '9',
    sensitive: false,
    language: 'en',
    media_attachments: [],
    poll: null,
    ...overrides,
  } as unknown as Status;
}

describe('StatusEditDialog', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function open(post: Status): { f: ComponentFixture<StatusEditDialog>; ui: Internals } {
    const f = TestBed.createComponent(StatusEditDialog);
    f.componentRef.setInput('status', post);
    f.detectChanges();
    http.expectOne('/api/v1/statuses/9/source').flush({ id: '9', text: 'hi', spoiler_text: '' });
    f.detectChanges();
    return { f, ui: f.componentInstance as unknown as Internals };
  }

  it('edits language, sensitivity and one description, and removes an attachment', () => {
    const { f, ui } = open(status({ media_attachments: [media('a', 'old'), media('b', 'keep')] }));
    const saved: Status[] = [];
    f.componentInstance.saved.subscribe((s) => saved.push(s));

    ui.language.set('de');
    ui.sensitive.set(true);
    ui.setDescription(0, 'new words');
    ui.removeMedia(1);
    ui.save();

    const req = http.expectOne('/api/v1/statuses/9');
    expect(req.request.body).toMatchObject({
      status: 'hi',
      language: 'de',
      sensitive: true,
      media_ids: ['a'],
      media_attributes: [{ id: 'a', description: 'new words' }],
    });
    expect(req.request.body.poll).toBeUndefined();
    req.flush(status());
    expect(saved).toHaveLength(1);
  });

  it('uploads a new attachment and waits until the server has processed it', async () => {
    vi.useFakeTimers();
    try {
      const { ui } = open(status());
      const input = document.createElement('input');
      input.type = 'file';
      Object.defineProperty(input, 'files', {
        value: [new File(['x'], 'cat.png', { type: 'image/png' })],
      });

      const done = ui.addFiles(input);
      await vi.waitFor(() => http.expectOne('/api/v2/media').flush({ ...media('n'), url: null }));
      expect(ui.canSave()).toBe(false);
      await vi.advanceTimersByTimeAsync(1000);
      http.expectOne('/api/v1/media/n').flush(media('n'));
      await done;

      expect(ui.media().map((m) => m.id)).toEqual(['n']);
      expect(ui.canSave()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('warns before a choice change clears votes and keeps the remaining time', () => {
    const { ui } = open(status({ poll: poll() }));
    expect(ui.votesReset()).toBe(false);

    ui.setOption(1, 'Cocoa');
    ui.addOption();
    expect(ui.canSave()).toBe(false); // the new choice is empty
    ui.setOption(2, 'Juice');
    ui.setMultiple(true);
    expect(ui.votesReset()).toBe(true);
    ui.save();

    const body = http.expectOne('/api/v1/statuses/9').request.body;
    expect(body.poll.options).toEqual(['Tea', 'Cocoa', 'Juice']);
    expect(body.poll.multiple).toBe(true);
    expect(body.poll.expires_in).toBeGreaterThan(7000);
  });

  it('says that keeping a closed poll reopens it', () => {
    const { ui } = open(
      status({ poll: poll({ expired: true, expires_at: '2020-01-01T00:00:00Z' }) }),
    );
    expect(ui.reopensPoll()).toBe(true);
    ui.removePoll();
    expect(ui.reopensPoll()).toBe(false);
  });

  it('offers a poll or attachments, never both', () => {
    const { ui } = open(status());
    expect(ui.canAddMedia()).toBe(true);
    ui.addPoll();
    expect(ui.canAddMedia()).toBe(false);
    expect(ui.poll()?.options).toEqual(['', '']);
  });
});
