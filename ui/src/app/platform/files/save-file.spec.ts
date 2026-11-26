import { afterEach, expect, it, vi } from 'vitest';
import { saveFile } from './save-file';
afterEach(() => vi.unstubAllGlobals());
it('sends UTF-8 and arbitrary binary bytes to the dialog, and preserves cancellation', async () => {
  const invoke = vi.fn().mockResolvedValue(false);
  vi.stubGlobal('__TAURI__', { core: { invoke } });
  const blob = {
    size: 4,
    arrayBuffer: async () => new Uint8Array([0, 255, 195, 169]).buffer,
  } as Blob;
  expect(await saveFile(blob, 'export.zip')).toBe(false);
  expect(invoke).toHaveBeenCalledWith('save_export', {
    fileName: 'export.zip',
    bytes: [0, 255, 195, 169],
  });
});
it('reports host errors without falling back to blocked browser downloads', async () => {
  vi.stubGlobal('__TAURI__', {
    core: { invoke: vi.fn().mockRejectedValue(new Error('disk full')) },
  });
  await expect(
    saveFile({ size: 0, arrayBuffer: async () => new ArrayBuffer(0) } as Blob, 'file.txt'),
  ).rejects.toThrow('disk full');
});
it('rejects oversized exports before IPC', async () => {
  const invoke = vi.fn();
  vi.stubGlobal('__TAURI__', { core: { invoke } });
  await expect(saveFile({ size: 32 * 1024 * 1024 + 1 } as Blob, 'large.zip')).rejects.toThrow(
    '32 MiB',
  );
  expect(invoke).not.toHaveBeenCalled();
});
