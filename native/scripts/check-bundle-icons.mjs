import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = new URL('../src-tauri/', import.meta.url);
const config = JSON.parse(readFileSync(new URL('tauri.conf.json', root), 'utf8'));
const icons = config.bundle?.icon ?? [];
let squarePng = false;
for (const path of icons) {
  const bytes = readFileSync(new URL(path, root));
  if (!bytes.length) throw new Error(`Empty bundle icon: ${path}`);
  if (path.endsWith('.png')) {
    if (bytes.length < 24 || bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
      throw new Error(`Invalid PNG header: ${path}`);
    }
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width > 0 && width === height) squarePng = true;
    console.log(`${path}: ${width}x${height}`);
  }
}
if (!squarePng) throw new Error('bundle.icon must list an existing square PNG for AppImage');
console.log(`Validated ${icons.length} configured bundle icons in ${fileURLToPath(root)}`);
