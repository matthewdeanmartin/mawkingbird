/**
 * Read a description the photographer or an editing tool already wrote into an
 * image's metadata, so the composer can offer it as alt text.
 *
 * Mirrors Phanpy's order of preference: IPTC Caption/Abstract, then XMP
 * `dc:description`, then EXIF ImageDescription. Supports JPEG, PNG and WebP.
 * HEIC/AVIF and compressed PNG text are not read; those images simply get no
 * suggestion. Everything happens locally on the selected file before upload.
 */

/** Mastodon's own limit on media descriptions. */
const MAX_DESCRIPTION = 1500;
/** Files bigger than this are not scanned; reading them all would be wasteful. */
const MAX_SCAN_BYTES = 32 * 1024 * 1024;

/**
 * Placeholder text cameras and phones write into ImageDescription. These are
 * not descriptions, and suggesting them as alt text would be worse than none.
 */
const CAMERA_PLACEHOLDERS = [
  /^olympus digital camera$/i,
  /^sony dsc$/i,
  /^digital camera$/i,
  /^default$/i,
  /^image$/i,
  /^picture$/i,
  /^photo$/i,
  /^description$/i,
  /^untitled$/i,
  /^(?:dcim|img|dsc|dscn|dscf|pxl)[\s_-]?\d+.*$/i,
  /^(?:screenshot|screen shot)[\s_-].*\d.*$/i,
  /^[\s?._-]*$/,
];

interface Found {
  /** IPTC Caption/Abstract, or a PNG `Description` text chunk (same meaning). */
  iptc?: string;
  xmp?: string;
  exif?: string;
}

/** The embedded description of `file`, or null when there is no usable one. */
export async function extractImageDescription(file: Blob): Promise<string | null> {
  if (!file.type.startsWith('image/') || file.size > MAX_SCAN_BYTES) return null;
  try {
    return descriptionFromBytes(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return null;
  }
}

/** Synchronous core, exported for tests. */
export function descriptionFromBytes(bytes: Uint8Array): string | null {
  const found: Found = {};
  if (bytes[0] === 0xff && bytes[1] === 0xd8) readJpeg(bytes, found);
  else if (ascii(bytes, 1, 3) === 'PNG') readPng(bytes, found);
  else if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') readWebp(bytes, found);
  for (const candidate of [found.iptc, found.xmp, found.exif]) {
    const clean = tidy(candidate);
    if (clean) return clean;
  }
  return null;
}

function tidy(text: string | undefined): string | null {
  const value = text
    // eslint-disable-next-line no-control-regex -- strips control characters from metadata
    ?.replace(/[\u0000-\u001f\u007f]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!value || CAMERA_PLACEHOLDERS.some((pattern) => pattern.test(value))) return null;
  return value.length > MAX_DESCRIPTION ? value.slice(0, MAX_DESCRIPTION) : value;
}

// --- containers -----------------------------------------------------------

function readJpeg(bytes: Uint8Array, found: Found): void {
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1];
    // Start of scan or end of image: no metadata follows.
    if (marker === 0xda || marker === 0xd9) return;
    const length = u16(bytes, at + 2, false);
    const start = at + 4;
    const end = Math.min(at + 2 + length, bytes.length);
    const segment = bytes.subarray(start, end);
    if (marker === 0xe1) {
      if (ascii(segment, 0, 6) === 'Exif\0\0') found.exif ??= readTiff(segment.subarray(6));
      else if (ascii(segment, 0, 29) === 'http://ns.adobe.com/xap/1.0/\0') {
        found.xmp ??= readXmp(segment.subarray(29));
      }
    } else if (marker === 0xed && ascii(segment, 0, 14) === 'Photoshop 3.0\0') {
      found.iptc ??= readPhotoshop(segment.subarray(14));
    }
    if (length < 2) return;
    at += 2 + length;
  }
}

function readPng(bytes: Uint8Array, found: Found): void {
  let at = 8;
  while (at + 12 <= bytes.length) {
    const length = u32(bytes, at, false);
    const type = ascii(bytes, at + 4, 4);
    const data = bytes.subarray(at + 8, Math.min(at + 8 + length, bytes.length));
    if (type === 'tEXt') {
      const nul = data.indexOf(0);
      if (nul > 0 && latin1(data.subarray(0, nul)) === 'Description') {
        found.iptc ??= latin1(data.subarray(nul + 1));
      }
    } else if (type === 'iTXt') {
      const text = readPngInternational(data);
      if (text?.keyword === 'XML:com.adobe.xmp') found.xmp ??= readXmp(text.value);
      else if (text?.keyword === 'Description') found.iptc ??= utf8(text.value);
    } else if (type === 'eXIf') {
      found.exif ??= readTiff(data);
    } else if (type === 'IEND') {
      return;
    }
    at += 12 + length;
  }
}

/** iTXt: keyword\0 flag method lang\0 translated\0 text. Compressed text is skipped. */
function readPngInternational(data: Uint8Array): { keyword: string; value: Uint8Array } | null {
  const k = data.indexOf(0);
  if (k <= 0 || data[k + 1] !== 0) return null;
  const lang = data.indexOf(0, k + 3);
  const translated = lang < 0 ? -1 : data.indexOf(0, lang + 1);
  if (translated < 0) return null;
  return { keyword: latin1(data.subarray(0, k)), value: data.subarray(translated + 1) };
}

function readWebp(bytes: Uint8Array, found: Found): void {
  let at = 12;
  while (at + 8 <= bytes.length) {
    const type = ascii(bytes, at, 4);
    const size = u32(bytes, at + 4, true);
    const data = bytes.subarray(at + 8, Math.min(at + 8 + size, bytes.length));
    if (type === 'EXIF') {
      found.exif ??= readTiff(ascii(data, 0, 6) === 'Exif\0\0' ? data.subarray(6) : data);
    } else if (type === 'XMP ') {
      found.xmp ??= readXmp(data);
    }
    at += 8 + size + (size % 2);
  }
}

// --- metadata formats -----------------------------------------------------

/** EXIF: IFD0 tag 0x010E (ImageDescription). */
function readTiff(tiff: Uint8Array): string | undefined {
  const order = ascii(tiff, 0, 2);
  if (order !== 'II' && order !== 'MM') return undefined;
  const little = order === 'II';
  if (u16(tiff, 2, little) !== 42) return undefined;
  const ifd = u32(tiff, 4, little);
  const count = u16(tiff, ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > tiff.length) return undefined;
    if (u16(tiff, entry, little) !== 0x010e) continue;
    const length = u32(tiff, entry + 4, little);
    const offset = length <= 4 ? entry + 8 : u32(tiff, entry + 8, little);
    return utf8(tiff.subarray(offset, offset + length));
  }
  return undefined;
}

/** XMP: `dc:description`, preferring the x-default language alternative. */
function readXmp(xml: Uint8Array): string | undefined {
  const text = utf8(xml);
  const block = /<dc:description\b[^>]*>([\s\S]*?)<\/dc:description>/u.exec(text)?.[1];
  if (block === undefined) {
    const attribute = /\bdc:description\s*=\s*"([^"]*)"/u.exec(text)?.[1];
    return attribute === undefined ? undefined : xmlText(attribute);
  }
  const items = [...block.matchAll(/<rdf:li\b([^>]*)>([\s\S]*?)<\/rdf:li>/gu)];
  const preferred = items.find((m) => /xml:lang\s*=\s*["']x-default["']/u.test(m[1])) ?? items[0];
  return xmlText(preferred ? preferred[2] : block);
}

/** Photoshop image resources: resource 0x0404 holds IPTC-NAA records. */
function readPhotoshop(data: Uint8Array): string | undefined {
  let at = 0;
  while (at + 12 <= data.length && ascii(data, at, 4) === '8BIM') {
    const id = u16(data, at + 4, false);
    const nameLength = data[at + 6];
    const nameEnd = at + 6 + nameLength + 1 + ((nameLength + 1) % 2);
    const size = u32(data, nameEnd, false);
    const body = data.subarray(nameEnd + 4, nameEnd + 4 + size);
    if (id === 0x0404) return readIptc(body);
    at = nameEnd + 4 + size + (size % 2);
  }
  return undefined;
}

/** IPTC IIM: dataset 2:120 is Caption/Abstract; 1:90 says whether text is UTF-8. */
function readIptc(data: Uint8Array): string | undefined {
  let isUtf8 = false;
  let caption: Uint8Array | undefined;
  let at = 0;
  while (at + 5 <= data.length && data[at] === 0x1c) {
    const record = data[at + 1];
    const dataset = data[at + 2];
    const size = u16(data, at + 3, false);
    if (size & 0x8000) return undefined; // extended length: not used for captions
    const value = data.subarray(at + 5, at + 5 + size);
    if (record === 1 && dataset === 90) isUtf8 = ascii(value, 0, 3) === '\u001b%G';
    if (record === 2 && dataset === 120) caption = value;
    at += 5 + size;
  }
  if (!caption) return undefined;
  return isUtf8 ? utf8(caption) : looksUtf8(caption) ? utf8(caption) : latin1(caption);
}

// --- byte helpers -----------------------------------------------------------

function u16(bytes: Uint8Array, at: number, little: boolean): number {
  return little ? bytes[at] | (bytes[at + 1] << 8) : (bytes[at] << 8) | bytes[at + 1];
}

function u32(bytes: Uint8Array, at: number, little: boolean): number {
  const b = [bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]];
  return little
    ? (b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24)) >>> 0
    : ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0;
}

function ascii(bytes: Uint8Array, at: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(at, at + length));
}

function latin1(bytes: Uint8Array): string {
  return new TextDecoder('latin1').decode(bytes);
}

function utf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

function looksUtf8(bytes: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

function xmlText(text: string): string {
  return text
    .replace(/<[^>]*>/gu, '')
    .replace(/&#x([0-9a-f]+);/giu, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_, dec: string) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&quot;/gu, '"')
    .replace(/&apos;/gu, "'")
    .replace(/&amp;/gu, '&');
}
