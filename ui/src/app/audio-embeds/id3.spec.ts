import { describe, expect, it } from 'vitest';
import { readId3 } from './id3';

function syncsafe(value: number): number[] {
  return [(value >> 21) & 0x7f, (value >> 14) & 0x7f, (value >> 7) & 0x7f, value & 0x7f];
}
function frame(id: string, encoding: number, body: number[], version: 3 | 4): number[] {
  const payload = [encoding, ...body];
  const size =
    version === 4
      ? syncsafe(payload.length)
      : [0, 0, (payload.length >> 8) & 0xff, payload.length & 0xff];
  return [...[...id].map((c) => c.charCodeAt(0)), ...size, 0, 0, ...payload];
}
function tag(frames: number[], version: 2 | 3 | 4, flags = 0): Uint8Array {
  return new Uint8Array([
    0x49,
    0x44,
    0x33,
    version,
    0,
    flags,
    ...syncsafe(frames.length),
    ...frames,
  ]);
}
const utf8 = (value: string) => [...new TextEncoder().encode(value)];

describe('readId3', () => {
  it('reads v2.4 UTF-8 and v2.3 UTF-16 title and artist frames', () => {
    expect(
      readId3(
        tag(
          [...frame('TIT2', 3, utf8('Život jest sen'), 4), ...frame('TPE1', 3, utf8('Victor'), 4)],
          4,
        ),
      ),
    ).toEqual({ title: 'Život jest sen', artist: 'Victor' });
    const utf16 = [0xff, 0xfe, ...[...'Sea'].flatMap((c) => [c.charCodeAt(0), 0])];
    expect(readId3(tag(frame('TIT2', 1, utf16, 3), 3))).toEqual({ title: 'Sea' });
  });

  it('reads v2.2 three-letter frames with Latin-1 text', () => {
    const body = [0, ...[...'Old'].map((c) => c.charCodeAt(0))];
    expect(readId3(tag([0x54, 0x54, 0x32, 0, 0, body.length, ...body], 2))).toEqual({
      title: 'Old',
    });
  });

  it('ignores non-tags, unsynchronised tags and frames past the available bytes', () => {
    expect(readId3(new Uint8Array([0xff, 0xfb, 0x90, 0, 0, 0, 0, 0, 0, 0]))).toEqual({});
    expect(readId3(tag(frame('TIT2', 3, utf8('x'), 4), 4, 0x80))).toEqual({});
    const truncated = tag(frame('TIT2', 3, utf8('Long title'), 4), 4).subarray(0, 20);
    expect(readId3(truncated)).toEqual({});
  });
});
