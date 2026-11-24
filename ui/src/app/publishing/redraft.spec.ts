import { describe, expect, it } from 'vitest';
import { Status } from '../platform/api/models';
import { redraftSeed } from './redraft';

const source = { id: '1', text: 'hello', spoiler_text: 'spoilers' };
const base = {
  id: '1',
  created_at: '2026-01-01T00:00:00Z',
  visibility: 'unlisted',
  sensitive: true,
  language: 'fi',
  poll: null,
  media_attachments: [],
} as unknown as Status;

describe('redraftSeed', () => {
  it('carries text, content warning, visibility, sensitivity and language', () => {
    expect(redraftSeed(base, source).snapshot).toMatchObject({
      segments: ['hello'],
      spoilerText: 'spoilers',
      visibility: 'unlisted',
      sensitive: true,
      postLanguage: 'fi',
      postLanguageExplicit: true,
    });
  });

  it('reuses the attachments with their descriptions and focal points', () => {
    const media = {
      id: 'm1',
      type: 'image',
      url: 'u',
      preview_url: 'p',
      description: 'a cat',
      meta: { focus: { x: 0.5, y: -0.5 } },
    };
    expect(redraftSeed({ ...base, media_attachments: [media] }, source).media).toEqual([
      { media, description: 'a cat', focus: { x: 0.5, y: -0.5 } },
    ]);
  });

  it('rebuilds a poll at the nearest offered length', () => {
    const poll = {
      options: [{ title: 'A' }, { title: 'B' }],
      multiple: true,
      expires_at: '2026-01-03T23:00:00Z',
    } as unknown as Status['poll'];
    expect(redraftSeed({ ...base, poll }, source).snapshot.poll).toEqual({
      options: ['A', 'B'],
      multiple: true,
      expiresIn: 259200,
    });
  });
});
