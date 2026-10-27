/** Title and artist from an ID3v2 tag at the start of an MP3; v2.2 to v2.4. */
export interface AudioTags {
  title?: string;
  artist?: string;
}

/** Bytes requested for a tag read: enough for the text frames, not the cover art. */
export const TAG_BYTES = 65_536;

function syncsafe(bytes: Uint8Array, at: number): number {
  return (
    ((bytes[at] & 0x7f) << 21) |
    ((bytes[at + 1] & 0x7f) << 14) |
    ((bytes[at + 2] & 0x7f) << 7) |
    (bytes[at + 3] & 0x7f)
  );
}

function text(frame: Uint8Array): string {
  if (!frame.length) return '';
  const encoding = frame[0];
  const body = frame.subarray(1);
  const label =
    encoding === 1 ? 'utf-16' : encoding === 2 ? 'utf-16be' : encoding === 3 ? 'utf-8' : 'latin1';
  try {
    return (
      new TextDecoder(label)
        .decode(body)
        .split('\0')[0]
        // Drop control characters, which some taggers leave in text frames.
        .replace(/./gsu, (char) => (char < ' ' || char === '\u007f' ? '' : char))
        .trim()
        .slice(0, 200)
    );
  } catch {
    return '';
  }
}

/** Parse the frames that fit in `bytes`; a truncated tag yields what was read. */
export function readId3(bytes: Uint8Array): AudioTags {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return {};
  const version = bytes[3];
  if (version < 2 || version > 4) return {};
  // Unsynchronised tags need byte-level reversal; skip them rather than misread.
  if (bytes[5] & 0x80) return {};
  const end = Math.min(bytes.length, 10 + syncsafe(bytes, 6));
  let at = 10;
  if (version > 2 && bytes[5] & 0x40)
    at +=
      version === 4
        ? syncsafe(bytes, 10)
        : new DataView(bytes.buffer, bytes.byteOffset).getUint32(10) + 4;
  const ids = version === 2 ? { title: 'TT2', artist: 'TP1' } : { title: 'TIT2', artist: 'TPE1' };
  const header = version === 2 ? 6 : 10;
  const tags: AudioTags = {};
  while (at + header <= end) {
    const id = String.fromCharCode(...bytes.subarray(at, at + (version === 2 ? 3 : 4)));
    if (!/^[A-Z0-9]{3,4}$/.test(id)) break;
    const size =
      version === 2
        ? (bytes[at + 3] << 16) | (bytes[at + 4] << 8) | bytes[at + 5]
        : version === 4
          ? syncsafe(bytes, at + 4)
          : new DataView(bytes.buffer, bytes.byteOffset).getUint32(at + 4);
    const start = at + header;
    if (size <= 0 || start + size > end) break;
    if (id === ids.title) tags.title = text(bytes.subarray(start, start + size)) || undefined;
    if (id === ids.artist) tags.artist = text(bytes.subarray(start, start + size)) || undefined;
    if (tags.title && tags.artist) break;
    at = start + size;
  }
  return tags;
}
