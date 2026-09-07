import { describe, expect, it } from 'vitest';
import { Draft } from '../../drafts';
import { Account, ScheduledStatus, Status } from '../../models';
import { PasteRecord } from '../../providers/paste/paste-history';
import {
  PARKED_SCHEDULE_YEARS,
  SELF_DRAFT_MAX_AGE_DAYS,
  isParkedSchedule,
  isSelfDraft,
  localDraftItem,
  mergeDraftItems,
  pasteDraftItem,
  scheduledDraftItem,
  selfDraftItem,
  toSnapshot,
} from './draft-items';

const NOW = Date.parse('2026-07-27T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function account(id: string): Account {
  return { id, username: 'me', acct: 'me' } as Account;
}

function status(overrides: Partial<Status> = {}): Status {
  return {
    id: 's1',
    created_at: new Date(NOW - DAY).toISOString(),
    content: '<p>a note</p>',
    spoiler_text: '',
    visibility: 'direct',
    account: account('me-1'),
    reblog: null,
    mentions: [],
    media_attachments: [],
    poll: null,
    ...overrides,
  } as Status;
}

function scheduled(at: string, overrides: Partial<ScheduledStatus> = {}): ScheduledStatus {
  return {
    id: 'sch1',
    scheduled_at: at,
    params: { text: 'later' },
    media_attachments: [],
    ...overrides,
  } as ScheduledStatus;
}

describe('isParkedSchedule', () => {
  it('treats a schedule past the parking threshold as a draft', () => {
    const far = new Date(NOW);
    far.setFullYear(far.getFullYear() + PARKED_SCHEDULE_YEARS + 1);
    expect(isParkedSchedule(scheduled(far.toISOString()), NOW)).toBe(true);
  });

  it('leaves a schedule just inside the threshold as a real pending post', () => {
    const near = new Date(NOW);
    near.setFullYear(near.getFullYear() + PARKED_SCHEDULE_YEARS);
    near.setDate(near.getDate() - 1);
    expect(isParkedSchedule(scheduled(near.toISOString()), NOW)).toBe(false);
  });

  it('is not fooled by a tomorrow schedule', () => {
    expect(isParkedSchedule(scheduled(new Date(NOW + DAY).toISOString()), NOW)).toBe(false);
  });

  it('rejects an unparseable date rather than guessing', () => {
    expect(isParkedSchedule(scheduled('not a date'), NOW)).toBe(false);
  });
});

describe('isSelfDraft', () => {
  it('accepts a recent direct post to nobody', () => {
    expect(isSelfDraft(status(), 'me-1', NOW)).toBe(true);
  });

  it('rejects a direct post that mentions someone — that is a real DM', () => {
    const dm = status({ mentions: [{ id: 'x', username: 'pat', url: '', acct: 'pat' }] });
    expect(isSelfDraft(dm, 'me-1', NOW)).toBe(false);
  });

  it('rejects a non-direct post', () => {
    expect(isSelfDraft(status({ visibility: 'private' }), 'me-1', NOW)).toBe(false);
  });

  it("rejects someone else's post", () => {
    expect(isSelfDraft(status({ account: account('other') }), 'me-1', NOW)).toBe(false);
  });

  it('rejects a self-post older than the recency window', () => {
    const old = status({
      created_at: new Date(NOW - (SELF_DRAFT_MAX_AGE_DAYS + 1) * DAY).toISOString(),
    });
    expect(isSelfDraft(old, 'me-1', NOW)).toBe(false);
  });

  it('accepts one just inside the window', () => {
    const edge = status({
      created_at: new Date(NOW - (SELF_DRAFT_MAX_AGE_DAYS - 1) * DAY).toISOString(),
    });
    expect(isSelfDraft(edge, 'me-1', NOW)).toBe(true);
  });

  // Showing a real private message in a drafts list is far worse than missing a
  // note-to-self, so an absent mentions array is "unknown", not "none".
  it('rejects a post whose mentions are absent rather than assuming none', () => {
    expect(isSelfDraft(status({ mentions: undefined }), 'me-1', NOW)).toBe(false);
  });

  it('rejects a boost', () => {
    expect(isSelfDraft(status({ reblog: status() }), 'me-1', NOW)).toBe(false);
  });
});

describe('draft item adapters', () => {
  it('badges a local thread draft and previews its first filled segment', () => {
    const draft: Draft = {
      id: 'd1',
      updatedAt: new Date(NOW).toISOString(),
      segments: ['', 'first real one', 'second'],
      spoilerText: 'heads up',
      sensitive: false,
      visibility: 'private',
      poll: null,
    };
    const item = localDraftItem(draft);
    expect(item.key).toBe('local:d1');
    expect(item.preview).toBe('first real one');
    expect(item.visibility).toBe('private');
    expect(item.badges).toContain('pages.drafts.badges.thread|2');
    expect(item.badges).toContain('pages.drafts.badges.cw');
  });

  it('labels a paste-target local draft with Title rather than CW', () => {
    const draft: Draft = {
      id: 'd2',
      updatedAt: new Date(NOW).toISOString(),
      segments: ['body'],
      spoilerText: 'My title',
      sensitive: false,
      visibility: 'unlisted',
      poll: null,
      target: 'paste',
      pasteProviderId: 'rentry',
    };
    const badges = localDraftItem(draft).badges;
    expect(badges).toContain('pages.drafts.badges.title');
    expect(badges).toContain('📋 rentry');
    expect(badges).not.toContain('pages.drafts.badges.cw');
  });

  it('falls back to a descriptive preview for an empty poll draft', () => {
    const draft: Draft = {
      id: 'd3',
      updatedAt: new Date(NOW).toISOString(),
      segments: [''],
      spoilerText: '',
      sensitive: false,
      visibility: 'public',
      poll: { options: ['a', 'b'], multiple: false, expiresIn: 3600 },
    };
    expect(localDraftItem(draft).preview).toBe('pages.drafts.preview.pollDraft');
  });

  it('sorts a parked schedule by its publish date', () => {
    const item = scheduledDraftItem(scheduled('2124-01-01T00:00:00Z'));
    expect(item.kind).toBe('scheduled');
    expect(item.at).toBe('2124-01-01T00:00:00Z');
    expect(item.preview).toBe('later');
  });

  it('strips HTML from a self draft preview', () => {
    expect(selfDraftItem(status({ content: '<p>hello <b>there</b></p>' })).preview).toBe(
      'hello there',
    );
  });

  it('prefers a paste title over its body for the preview', () => {
    const record = {
      slug: 'abc',
      providerId: 'rentry',
      providerLabel: 'Rentry',
      title: 'Notes',
      content: 'the whole body',
      language: 'plaintext',
      expiry: '1w',
      visibility: 'unlisted',
      createdAt: new Date(NOW).toISOString(),
      url: 'https://rentry.co/abc',
      rawUrl: 'https://rentry.co/abc/raw',
      editKey: 'k',
    } as PasteRecord;
    const item = pasteDraftItem(record);
    expect(item.key).toBe('paste:abc');
    expect(item.preview).toBe('Notes');
    expect(item.badges).toContain('📋 Rentry');
    expect(item.badges).toContain('⌛ 1w');
  });
});

describe('toSnapshot', () => {
  const DEFAULT = 'unlisted';

  it('passes a local draft through, minus its identity fields', () => {
    const draft: Draft = {
      id: 'd1',
      updatedAt: new Date(NOW).toISOString(),
      segments: ['one', 'two'],
      spoilerText: 'cw',
      sensitive: true,
      visibility: 'private',
      poll: null,
      target: 'bsky',
    };
    const snapshot = toSnapshot({ kind: 'local', draft }, DEFAULT);
    expect(snapshot).not.toHaveProperty('id');
    expect(snapshot).not.toHaveProperty('updatedAt');
    expect(snapshot.segments).toEqual(['one', 'two']);
    expect(snapshot.visibility).toBe('private');
    expect(snapshot.target).toBe('bsky');
  });

  it('extracts a parked schedule, keeping its own visibility', () => {
    const snapshot = toSnapshot(
      {
        kind: 'scheduled',
        scheduled: scheduled('2124-01-01T00:00:00Z', {
          params: {
            text: 'cold take',
            visibility: 'private',
            spoiler_text: 'heads up',
            sensitive: true,
            poll: { options: ['a', 'b'] },
          },
        }),
      },
      DEFAULT,
    );
    expect(snapshot.segments).toEqual(['cold take']);
    expect(snapshot.spoilerText).toBe('heads up');
    expect(snapshot.sensitive).toBe(true);
    expect(snapshot.visibility).toBe('private');
    expect(snapshot.poll?.options).toEqual(['a', 'b']);
  });

  it('falls back to the posting default when a schedule carries no visibility', () => {
    const snapshot = toSnapshot(
      { kind: 'scheduled', scheduled: scheduled('2124-01-01T00:00:00Z') },
      DEFAULT,
    );
    expect(snapshot.visibility).toBe(DEFAULT);
  });

  // The single most important rule in the conversion matrix: a self draft is
  // `direct` only as a storage trick. Carrying that into a real post would
  // publish it to an audience of nobody — the exact failure the feature exists
  // to stop people hitting by hand.
  it('never carries a self draft’s `direct` visibility into the post', () => {
    const snapshot = toSnapshot({ kind: 'self', status: status() }, DEFAULT);
    expect(snapshot.visibility).toBe(DEFAULT);
    expect(snapshot.visibility).not.toBe('direct');
  });

  it('strips HTML out of a self draft body', () => {
    const snapshot = toSnapshot(
      { kind: 'self', status: status({ content: '<p>hello <b>there</b></p>' }) },
      DEFAULT,
    );
    expect(snapshot.segments).toEqual(['hello there']);
  });

  it('carries a self draft’s poll options across', () => {
    const withPoll = status({
      poll: {
        id: 'p',
        options: [
          { title: 'yes', votes_count: 0 },
          { title: 'no', votes_count: 0 },
        ],
        multiple: true,
      },
    } as Partial<Status>);
    expect(toSnapshot({ kind: 'self', status: withPoll }, DEFAULT).poll).toEqual({
      options: ['yes', 'no'],
      multiple: true,
      expiresIn: 86400,
    });
  });

  it('maps a paste’s title to the spoiler slot and keeps its provider metadata', () => {
    const record = {
      slug: 'abc',
      providerId: 'rentry',
      providerLabel: 'Rentry',
      title: 'Notes',
      content: 'the body',
      language: 'python',
      expiry: '1w',
      visibility: 'unlisted',
      createdAt: new Date(NOW).toISOString(),
      url: 'u',
      rawUrl: 'r',
      editKey: 'k',
    } as PasteRecord;
    const snapshot = toSnapshot({ kind: 'paste', record }, DEFAULT);
    expect(snapshot.segments).toEqual(['the body']);
    expect(snapshot.spoilerText).toBe('Notes');
    expect(snapshot.target).toBe('paste');
    expect(snapshot.pasteProviderId).toBe('rentry');
    expect(snapshot.pasteLanguage).toBe('python');
    expect(snapshot.pasteExpiry).toBe('1w');
  });
});

describe('mergeDraftItems', () => {
  it('interleaves kinds newest-first rather than grouping them', () => {
    const local = localDraftItem({
      id: 'd1',
      updatedAt: '2026-07-20T00:00:00Z',
      segments: ['local'],
      spoilerText: '',
      sensitive: false,
      visibility: 'public',
      poll: null,
    });
    const self = selfDraftItem(status({ id: 's9', created_at: '2026-07-25T00:00:00Z' }));
    const parked = scheduledDraftItem(scheduled('2124-01-01T00:00:00Z'));

    expect(mergeDraftItems([[local], [self], [parked]]).map((i) => i.kind)).toEqual([
      'scheduled',
      'self',
      'local',
    ]);
  });

  it('is empty for no sources', () => {
    expect(mergeDraftItems([[], [], [], []])).toEqual([]);
  });
});
