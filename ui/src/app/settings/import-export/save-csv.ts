import { saveBlob } from '../../platform/files/save-file';
export function saveCsv(csv: string, filename: string): void {
  saveBlob(new Blob([csv], { type: 'text/csv' }), filename);
}
