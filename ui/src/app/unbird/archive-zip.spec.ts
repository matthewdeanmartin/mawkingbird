import { strToU8, Zippable, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { listZipEntries, readZipText, ZipReadError } from './archive-zip';

function zipBlob(files: Record<string, string>, level: 0 | 6 = 6): Blob {
  const input: Zippable = {};
  for (const [name, text] of Object.entries(files)) input[name] = [strToU8(text), { level }];
  return new Blob([zipSync(input) as BlobPart]);
}

describe('archive zip reader', () => {
  it('lists files from the central directory and leaves directories out', async () => {
    const blob = zipBlob({
      'data/tweets.js': 'a',
      'data/like.js': 'b',
      'data/tweets_media/x.jpg': 'c',
    });
    const names = (await listZipEntries(blob)).map((entry) => entry.name).sort();
    expect(names).toEqual(['data/like.js', 'data/tweets.js', 'data/tweets_media/x.jpg']);
  });

  it('inflates only the entry asked for, deflated or stored', async () => {
    for (const level of [0, 6] as const) {
      const blob = zipBlob({ 'data/one.js': 'window.YTD.x = [1]', 'data/two.js': 'two' }, level);
      const entry = (await listZipEntries(blob)).find((item) => item.name === 'data/one.js')!;
      expect(await readZipText(blob, entry)).toBe('window.YTD.x = [1]');
    }
  });

  it('reads UTF-8 text intact', async () => {
    const blob = zipBlob({ 'data/tweets.js': 'café 🐦 日本' });
    const [entry] = await listZipEntries(blob);
    expect(await readZipText(blob, entry)).toBe('café 🐦 日本');
  });

  it('refuses a file that is not a zip', async () => {
    await expect(listZipEntries(new Blob(['not a zip at all']))).rejects.toBeInstanceOf(
      ZipReadError,
    );
  });
});
