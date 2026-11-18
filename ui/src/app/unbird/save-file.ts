/** Hand a file to the browser as a download, without a round trip to any server. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  // Some browsers start the download after this tick; give them a moment.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
