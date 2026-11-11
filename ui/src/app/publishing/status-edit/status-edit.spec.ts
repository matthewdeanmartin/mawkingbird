import { describe, expect, it } from 'vitest';
import { Poll } from '../../platform/api/models';
import { buildEditBody, editPollFrom, pollVotesReset, remainingSeconds } from './status-edit';

const NOW = Date.parse('2026-11-11T12:00:00Z');

function poll(overrides: Partial<Poll> = {}): Poll {
  return {
    id: 'p',
    expires_at: '2026-11-11T13:00:00Z',
    expired: false,
    multiple: false,
    votes_count: 3,
    voters_count: 3,
    options: [
      { title: 'Tea', votes_count: 2 },
      { title: 'Coffee', votes_count: 1 },
    ],
    voted: false,
    own_votes: [],
    ...overrides,
  } as Poll;
}

describe('status edit helpers', () => {
  it('keeps an open poll on its remaining time and a closed one at the minimum', () => {
    expect(remainingSeconds(poll(), NOW)).toBe(3600);
    expect(remainingSeconds(poll({ expires_at: '2026-11-11T11:00:00Z' }), NOW)).toBe(300);
  });

  it('only warns about a vote reset when choices or the multiple flag change', () => {
    const previous = poll();
    const same = editPollFrom(previous, NOW);
    expect(pollVotesReset(previous, same)).toBe(false);
    expect(pollVotesReset(previous, { ...same, options: ['Tea', 'Cocoa'] })).toBe(true);
    expect(pollVotesReset(previous, { ...same, multiple: true })).toBe(true);
    expect(pollVotesReset(null, same)).toBe(false);
  });

  it('sends every field, the poll so Mastodon keeps it, and only changed descriptions', () => {
    const body = buildEditBody({
      text: 'Hello',
      spoilerText: ' cw ',
      sensitive: true,
      language: 'en',
      media: [
        { id: 'm1', type: 'image', previewUrl: '', description: 'same', savedDescription: 'same' },
        { id: 'm2', type: 'image', previewUrl: '', description: ' new ', savedDescription: '' },
      ],
      poll: { options: [' Tea ', 'Coffee'], multiple: false, expiresIn: 3600 },
    });
    expect(body).toEqual({
      status: 'Hello',
      spoiler_text: 'cw',
      sensitive: true,
      language: 'en',
      media_ids: ['m1', 'm2'],
      media_attributes: [{ id: 'm2', description: 'new' }],
      poll: { options: ['Tea', 'Coffee'], multiple: false, expires_in: 3600 },
    });
  });

  it('leaves out the poll when the author removed it', () => {
    const body = buildEditBody({
      text: 'x',
      spoilerText: '',
      sensitive: false,
      language: '',
      media: [],
      poll: null,
    });
    expect(body.poll).toBeUndefined();
    expect(body.language).toBeUndefined();
  });

  it('sends a moved focus point with the description it already has, and nothing for unmoved ones', () => {
    const base = { type: 'image', previewUrl: '', description: 'heron', savedDescription: 'heron' };
    const body = buildEditBody({
      text: 'x',
      spoilerText: '',
      sensitive: false,
      language: '',
      media: [
        { ...base, id: 'still', focus: { x: 0.2, y: 0.2 }, savedFocus: { x: 0.2, y: 0.2 } },
        { ...base, id: 'moved', focus: { x: 0.25, y: 0.6 }, savedFocus: null },
        { ...base, id: 'reset', focus: null, savedFocus: { x: 0.5, y: 0.5 } },
      ],
      poll: null,
    });
    expect(body.media_attributes).toEqual([
      { id: 'moved', description: 'heron', focus: '0.25,0.6' },
      { id: 'reset', description: 'heron', focus: '0,0' },
    ]);
  });
});
