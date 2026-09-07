import { describe, expect, it } from 'vitest';

import { MediaAttachment } from '../models';
import {
  DescribableMedia,
  altTextMessage,
  hasUndescribedMedia,
  mediaTypeOf,
  needsDescription,
  undescribedIndexes,
} from './alt-text';

function attachment(type: string, description = ''): DescribableMedia {
  return {
    media: { id: 'm', type, url: '', preview_url: '', description: null } as MediaAttachment,
    description,
  };
}

describe('mediaTypeOf', () => {
  it('classifies the kinds Mastodon distinguishes', () => {
    expect(mediaTypeOf(new File([], 'a.png', { type: 'image/png' }))).toBe('image');
    expect(mediaTypeOf(new File([], 'a.mp4', { type: 'video/mp4' }))).toBe('video');
    expect(mediaTypeOf(new File([], 'a.mp3', { type: 'audio/mpeg' }))).toBe('audio');
  });

  /** Mastodon treats an animated GIF as a looping video, not a still image. */
  it('calls a GIF a gifv', () => {
    expect(mediaTypeOf(new File([], 'a.gif', { type: 'image/gif' }))).toBe('gifv');
  });

  it('is case-insensitive about the MIME type', () => {
    expect(mediaTypeOf(new File([], 'a.PNG', { type: 'IMAGE/PNG' }))).toBe('image');
  });

  /**
   * The bug this replaced hardcoded `image` for every file, so an attached
   * video claimed to be an image to anything that read the type.
   */
  it('does not guess a kind for a file it cannot place', () => {
    expect(mediaTypeOf(new File([], 'a.bin', { type: 'application/octet-stream' }))).toBe(
      'unknown',
    );
    expect(mediaTypeOf(new File([], 'a.bin', { type: '' }))).toBe('unknown');
  });
});

describe('needsDescription', () => {
  it('expects a description on every kind a screen reader will announce', () => {
    for (const type of ['image', 'gifv', 'video', 'audio']) {
      expect(needsDescription({ type } as MediaAttachment)).toBe(true);
    }
  });

  /** An upload the server could not process may never publish; nagging is noise. */
  it('does not ask about an attachment the server could not place', () => {
    expect(needsDescription({ type: 'unknown' } as MediaAttachment)).toBe(false);
  });
});

describe('undescribedIndexes', () => {
  it('reports nothing when every attachment is described', () => {
    const items = [attachment('image', 'a cat'), attachment('video', 'a dog')];
    expect(undescribedIndexes(items)).toEqual([]);
    expect(hasUndescribedMedia(items)).toBe(false);
  });

  it('points at the specific attachments that still need one', () => {
    const items = [attachment('image', 'described'), attachment('video'), attachment('audio')];
    expect(undescribedIndexes(items)).toEqual([1, 2]);
  });

  it('treats whitespace as no description at all', () => {
    expect(undescribedIndexes([attachment('image', '   ')])).toEqual([0]);
  });

  it('skips an unplaceable attachment even with no description', () => {
    expect(undescribedIndexes([attachment('unknown')])).toEqual([]);
  });
});

describe('altTextMessage', () => {
  it('says nothing when there is nothing to say', () => {
    expect(altTextMessage([], true)).toBeNull();
    expect(altTextMessage([], false)).toBeNull();
  });

  it('names the attachment rather than saying "an image"', () => {
    expect(altTextMessage([2], false)).toContain('Attachment 3');
  });

  it('counts when several are missing', () => {
    expect(altTextMessage([0, 1], false)).toContain('2 attachments');
  });

  /**
   * The wording is the only thing the opt-in changes. Phrasing advice as a
   * prohibition is how a composer teaches people to ignore it.
   */
  it('advises when not required and instructs when it is', () => {
    expect(altTextMessage([0], false)).toContain('Screen readers will skip');
    expect(altTextMessage([0], true)).toContain('before publishing');
  });
});
