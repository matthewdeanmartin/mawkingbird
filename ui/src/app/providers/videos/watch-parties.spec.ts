import { describe, expect, it } from 'vitest';
import { Status } from '../../models';
import { partyTags, partyWatchParams, PARTY_TAG_LIMIT } from './watch-parties';

const base = {
  id: '9',
  url: 'https://home.test/@x/9',
  created_at: '2026-10-01T00:00:00Z',
  content: '',
  media_attachments: [],
  card: null,
  reblog: null,
} as unknown as Status;

describe('partyTags', () => {
  it('accepts #tags and bare words, separated by spaces or commas, once each', () => {
    expect(partyTags('#Debate, debate  #Anime2000')).toEqual(['Debate', 'Anime2000']);
  });

  it('skips what Watch would reject, and caps at its limit', () => {
    expect(partyTags('ok not-a-tag #')).toEqual(['ok']);
    const many = Array.from({ length: 12 }, (_, i) => `t${i}`).join(' ');
    expect(partyTags(many)).toHaveLength(PARTY_TAG_LIMIT);
  });
});

describe('partyWatchParams', () => {
  it('opens an uploaded video with the party tags joined', () => {
    const status = {
      ...base,
      media_attachments: [{ id: 'm1', type: 'video', url: 'https://home.test/v.mp4' }],
    } as unknown as Status;
    expect(partyWatchParams(status, 'https://home.test', ['Debate', 'Live'])).toEqual({
      post: '9',
      server: 'https://home.test',
      attachment: 'm1',
      tags: 'Debate,Live',
    });
  });

  it('opens a YouTube link, and follows a boost to the original', () => {
    const original = {
      ...base,
      id: '7',
      content: '<p><a href="https://youtu.be/aaaaaaaaaaa">watch</a></p>',
    } as unknown as Status;
    const boost = { ...base, id: '8', reblog: original } as unknown as Status;
    expect(partyWatchParams(boost, 'https://home.test', ['Debate'])).toEqual({
      post: '7',
      server: 'https://home.test',
      youtube: 'aaaaaaaaaaa',
      tags: 'Debate',
    });
  });

  it('has no party for a video Watch cannot play', () => {
    const vimeo = {
      ...base,
      content: '<p><a href="https://vimeo.com/123">watch</a></p>',
    } as unknown as Status;
    expect(partyWatchParams(vimeo, 'https://home.test', ['Debate'])).toBeNull();
  });
});
