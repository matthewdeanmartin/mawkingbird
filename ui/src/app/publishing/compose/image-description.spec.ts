import { describe, expect, it } from 'vitest';
import { descriptionFromBytes, extractImageDescription } from './image-description';

const enc = new TextEncoder();
const bytes = (...parts: (number[] | Uint8Array | string)[]): Uint8Array<ArrayBuffer> => {
  const arrays = parts.map((p) =>
    typeof p === 'string' ? Uint8Array.from(p, (c) => c.charCodeAt(0)) : Uint8Array.from(p),
  );
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let at = 0;
  for (const a of arrays) {
    out.set(a, at);
    at += a.length;
  }
  return out;
};
const be16 = (n: number) => [(n >> 8) & 255, n & 255];
const be32 = (n: number) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >> 8) & 255];
const le32 = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];

/**
 * A little-endian TIFF with one IFD0 entry: ImageDescription. Values of four
 * bytes or fewer live inside the entry itself, as the TIFF format requires.
 */
function tiff(description: string): Uint8Array {
  const text = bytes(enc.encode(description), [0]);
  const inline = text.length <= 4;
  const value = inline ? bytes(text, new Array(4 - text.length).fill(0)) : bytes(le32(26));
  return bytes(
    'II',
    le16(42),
    le32(8),
    le16(1),
    le16(0x010e),
    le16(2),
    le32(text.length),
    value,
    le32(0),
    inline ? bytes() : text,
  );
}

function jpegSegment(marker: number, payload: Uint8Array): Uint8Array {
  return bytes([0xff, marker], be16(payload.length + 2), payload);
}

function jpeg(...segments: Uint8Array[]): Uint8Array<ArrayBuffer> {
  return bytes([0xff, 0xd8], ...segments, [0xff, 0xda, 0, 2]);
}

const exifSegment = (d: string) => jpegSegment(0xe1, bytes('Exif\0\0', tiff(d)));
const xmp = (inner: string) =>
  `<x:xmpmeta><rdf:RDF><rdf:Description>${inner}</rdf:Description></rdf:RDF></x:xmpmeta>`;
const xmpSegment = (inner: string) =>
  jpegSegment(0xe1, bytes('http://ns.adobe.com/xap/1.0/\0', enc.encode(xmp(inner))));

function iptcSegment(caption: string, utf8 = true): Uint8Array {
  const value = utf8 ? enc.encode(caption) : Uint8Array.from(caption, (c) => c.charCodeAt(0));
  const charset = utf8 ? bytes([0x1c, 1, 90], be16(3), [0x1b, 0x25, 0x47]) : bytes();
  const iptc = bytes(charset, [0x1c, 2, 120], be16(value.length), value);
  const resource = bytes(
    '8BIM',
    be16(0x0404),
    [0, 0],
    be32(iptc.length),
    iptc,
    iptc.length % 2 ? [0] : [],
  );
  return jpegSegment(0xed, bytes('Photoshop 3.0\0', resource));
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  return bytes(be32(data.length), type, data, [0, 0, 0, 0]);
}

const png = (...chunks: Uint8Array[]) =>
  bytes([0x89], 'PNG\r\n\x1a\n', ...chunks, pngChunk('IEND', bytes()));

describe('descriptionFromBytes', () => {
  it('reads EXIF ImageDescription from a JPEG', () => {
    expect(descriptionFromBytes(jpeg(exifSegment('A heron on a post')))).toBe('A heron on a post');
  });

  it('prefers IPTC over XMP over EXIF, like Phanpy', () => {
    const all = jpeg(
      exifSegment('From EXIF'),
      xmpSegment(
        '<dc:description><rdf:Alt><rdf:li xml:lang="x-default">From XMP</rdf:li></rdf:Alt></dc:description>',
      ),
      iptcSegment('From IPTC'),
    );
    expect(descriptionFromBytes(all)).toBe('From IPTC');
    expect(
      descriptionFromBytes(
        jpeg(
          exifSegment('From EXIF'),
          xmpSegment(
            '<dc:description><rdf:Alt><rdf:li xml:lang="x-default">From XMP</rdf:li></rdf:Alt></dc:description>',
          ),
        ),
      ),
    ).toBe('From XMP');
  });

  it('picks the x-default XMP alternative and decodes entities', () => {
    const image = jpeg(
      xmpSegment(
        '<dc:description><rdf:Alt><rdf:li xml:lang="de">Ein Hund</rdf:li><rdf:li xml:lang="x-default">A dog &amp; a &quot;cat&quot;</rdf:li></rdf:Alt></dc:description>',
      ),
    );
    expect(descriptionFromBytes(image)).toBe('A dog & a "cat"');
  });

  it('decodes UTF-8 and Latin-1 IPTC captions', () => {
    expect(descriptionFromBytes(jpeg(iptcSegment('Café in Zürich 🌧')))).toBe('Café in Zürich 🌧');
    expect(descriptionFromBytes(jpeg(iptcSegment('Café', false)))).toBe('Café');
  });

  it('ignores camera placeholders and blank descriptions', () => {
    for (const junk of ['OLYMPUS DIGITAL CAMERA', 'SONY DSC', '   ', 'DSC_0042', 'IMG_1234.JPG']) {
      expect(descriptionFromBytes(jpeg(exifSegment(junk)))).toBeNull();
    }
  });

  it('reads PNG Description text, iTXt XMP and eXIf', () => {
    expect(descriptionFromBytes(png(pngChunk('tEXt', bytes('Description\0', 'Sunset'))))).toBe(
      'Sunset',
    );
    const itxt = bytes(
      'XML:com.adobe.xmp\0',
      [0, 0],
      '\0\0',
      enc.encode(
        xmp('<dc:description><rdf:Alt><rdf:li>Harbour at dusk</rdf:li></rdf:Alt></dc:description>'),
      ),
    );
    expect(descriptionFromBytes(png(pngChunk('iTXt', itxt)))).toBe('Harbour at dusk');
    expect(descriptionFromBytes(png(pngChunk('eXIf', tiff('Moss on stone'))))).toBe(
      'Moss on stone',
    );
  });

  it('reads WebP EXIF and XMP chunks', () => {
    const chunk = (type: string, data: Uint8Array) =>
      bytes(type, le32(data.length), data, data.length % 2 ? [0] : []);
    const webp = (...chunks: Uint8Array[]) => {
      const body = bytes('WEBP', ...chunks);
      return bytes('RIFF', le32(body.length), body);
    };
    expect(descriptionFromBytes(webp(chunk('EXIF', tiff('Rain on glass'))))).toBe('Rain on glass');
    expect(
      descriptionFromBytes(
        webp(
          chunk(
            'XMP ',
            enc.encode(
              xmp('<dc:description><rdf:Alt><rdf:li>Two kites</rdf:li></rdf:Alt></dc:description>'),
            ),
          ),
        ),
      ),
    ).toBe('Two kites');
  });

  it('returns null for images without metadata and for truncated data', () => {
    expect(descriptionFromBytes(jpeg())).toBeNull();
    expect(descriptionFromBytes(exifSegment('cut').subarray(0, 9))).toBeNull();
    expect(descriptionFromBytes(bytes('GIF89a'))).toBeNull();
  });

  it('caps a description at Mastodon’s 1,500 characters', () => {
    const long = 'a'.repeat(2000);
    expect(descriptionFromBytes(jpeg(exifSegment(long)))?.length).toBe(1500);
  });
});

describe('extractImageDescription', () => {
  it('reads a File and skips non-images', async () => {
    const image = new File([jpeg(exifSegment('A red door'))], 'door.jpg', { type: 'image/jpeg' });
    expect(await extractImageDescription(image)).toBe('A red door');
    const text = new File(['hello'], 'a.txt', { type: 'text/plain' });
    expect(await extractImageDescription(text)).toBeNull();
  });
});
