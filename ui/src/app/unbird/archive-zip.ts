import { inflateSync } from 'fflate';

/**
 * Reads named files out of a `.zip` without unpacking the rest.
 *
 * A Twitter archive is often several gigabytes, nearly all of it media, and the
 * data Unbird needs is a few megabytes of `.js` files. So this reads the zip's
 * central directory from the end of the file with `Blob.slice`, then inflates
 * only the entries asked for. Nothing else is decompressed, and nothing is read
 * into memory beyond the directory and the chosen entries.
 *
 * Zip64 is supported, because archives over 4 GB use it. Encrypted entries and
 * compression methods other than stored (0) and deflate (8) are refused.
 */

export interface ZipEntry {
  /** Path inside the zip, with forward slashes. */
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  /** Offset of the entry's local header. */
  offset: number;
  encrypted: boolean;
}

export class ZipReadError extends Error {
  override readonly name = 'ZipReadError';
}

const EOCD_SIGNATURE = 0x06054b50;
const ZIP64_LOCATOR_SIGNATURE = 0x07064b50;
const ZIP64_EOCD_SIGNATURE = 0x06064b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
/** End record (22 bytes) plus the longest possible comment. */
const EOCD_SEARCH = 22 + 0xffff;

async function bytes(blob: Blob, start: number, end: number): Promise<Uint8Array> {
  const part = blob.slice(start, end);
  if (typeof part.arrayBuffer === 'function') {
    return new Uint8Array(await part.arrayBuffer());
  }
  return new Uint8Array(await new Response(part).arrayBuffer());
}

function u64(view: DataView, at: number): number {
  return Number(view.getBigUint64(at, true));
}

/** Every file entry in the zip's central directory (directories are left out). */
export async function listZipEntries(blob: Blob): Promise<ZipEntry[]> {
  const tailStart = Math.max(0, blob.size - EOCD_SEARCH);
  const tail = await bytes(blob, tailStart, blob.size);
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let eocd = -1;
  for (let at = tail.length - 22; at >= 0; at--) {
    if (tailView.getUint32(at, true) === EOCD_SIGNATURE) {
      eocd = at;
      break;
    }
  }
  if (eocd < 0) throw new ZipReadError('This file is not a zip archive.');

  let count = tailView.getUint16(eocd + 10, true);
  let directorySize = tailView.getUint32(eocd + 12, true);
  let directoryOffset = tailView.getUint32(eocd + 16, true);

  const locator = eocd - 20;
  if (locator >= 0 && tailView.getUint32(locator, true) === ZIP64_LOCATOR_SIGNATURE) {
    const recordAt = u64(tailView, locator + 8);
    const record = await bytes(blob, recordAt, recordAt + 56);
    const view = new DataView(record.buffer, record.byteOffset, record.byteLength);
    if (view.getUint32(0, true) !== ZIP64_EOCD_SIGNATURE) {
      throw new ZipReadError('This zip archive is damaged.');
    }
    count = u64(view, 32);
    directorySize = u64(view, 40);
    directoryOffset = u64(view, 48);
  }

  const directory = await bytes(blob, directoryOffset, directoryOffset + directorySize);
  const view = new DataView(directory.buffer, directory.byteOffset, directory.byteLength);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  let at = 0;
  for (let index = 0; index < count && at + 46 <= directory.length; index++) {
    if (view.getUint32(at, true) !== CENTRAL_SIGNATURE) {
      throw new ZipReadError('This zip archive is damaged.');
    }
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    let compressedSize = view.getUint32(at + 20, true);
    let size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    let offset = view.getUint32(at + 42, true);
    const name = decoder.decode(directory.subarray(at + 46, at + 46 + nameLength));

    // Zip64 extended information: present fields follow in this fixed order,
    // and only for the values that overflowed to 0xFFFFFFFF.
    let extra = at + 46 + nameLength;
    const extraEnd = extra + extraLength;
    while (extra + 4 <= extraEnd) {
      const id = view.getUint16(extra, true);
      const length = view.getUint16(extra + 2, true);
      if (id === 0x0001) {
        let field = extra + 4;
        if (size === 0xffffffff) {
          size = u64(view, field);
          field += 8;
        }
        if (compressedSize === 0xffffffff) {
          compressedSize = u64(view, field);
          field += 8;
        }
        if (offset === 0xffffffff) {
          offset = u64(view, field);
        }
      }
      extra += 4 + length;
    }

    if (!name.endsWith('/')) {
      entries.push({
        name: name.replace(/\\/g, '/'),
        method,
        compressedSize,
        size,
        offset,
        encrypted: (flags & 1) === 1,
      });
    }
    at = extraEnd + commentLength;
  }
  return entries;
}

/** One entry's contents, inflated. */
export async function readZipEntry(blob: Blob, entry: ZipEntry): Promise<Uint8Array> {
  if (entry.encrypted) throw new ZipReadError(`${entry.name} is encrypted.`);
  const header = await bytes(blob, entry.offset, entry.offset + 30);
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  if (header.length < 30 || view.getUint32(0, true) !== LOCAL_SIGNATURE) {
    throw new ZipReadError('This zip archive is damaged.');
  }
  const start = entry.offset + 30 + view.getUint16(26, true) + view.getUint16(28, true);
  const data = await bytes(blob, start, start + entry.compressedSize);
  if (entry.method === 0) return data;
  if (entry.method === 8) {
    return inflateSync(data, entry.size ? { out: new Uint8Array(entry.size) } : undefined);
  }
  throw new ZipReadError(`${entry.name} uses an unsupported compression method.`);
}

/** One entry as UTF-8 text. */
export async function readZipText(blob: Blob, entry: ZipEntry): Promise<string> {
  return new TextDecoder().decode(await readZipEntry(blob, entry));
}
