import { Component, computed, inject, output, signal } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { MbButton } from '../design-system/button/button';
import { MbDisclosure } from '../design-system/disclosure/disclosure';
import { MbFileDrop, MbPickedFile } from '../design-system/file-drop/file-drop';
import { MbNotice } from '../design-system/notice/notice';
import {
  ArchiveReadError,
  PickedFile,
  READ_FILES,
  readTwitterArchive,
  UnbirdArchive,
} from './unbird-archive';
import { ZipReadError } from './archive-zip';
import { UnbirdMatcher } from './unbird-matcher';

// i18n unbird.drop.title: Drop your Twitter archive here
// i18n unbird.drop.hint: The .zip file Twitter sent you. No need to unzip it.
// i18n unbird.drop.choose: Choose the .zip…
// i18n unbird.drop.folder: Already unzipped? Choose the folder
// i18n unbird.drop.privacy: Stays on your device
// i18n unbird.drop.opensBefore: opens only the {{count}} files it needs
// i18n unbird.drop.opensAfter: opened {{opened}} of {{total}} files
// i18n unbird.drop.which: Which?
// i18n unbird.drop.readList: Read:
// i18n unbird.drop.neverList: Never opened: your direct messages, email address, phone number, contacts, IP and device logs, and ad data. Your address book is opened only if you ask to export it.
// i18n unbird.drop.step.opening: Opening the archive…
// i18n unbird.drop.step.reading: Reading your follows, tweets and likes…
// i18n unbird.drop.step.sorting: Sorting your people…
// i18n unbird.drop.error.notArchive: That doesn't look like a Twitter archive. Choose the .zip Twitter sent you, or its unzipped folder.
// i18n unbird.drop.error.damaged: The archive could not be read. If it came in several parts, choose all of them together.
// i18n unbird.drop.loaded.from: Archive of @{{user}}
// i18n unbird.drop.loaded.fromUnknown: Your Twitter archive
// i18n unbird.drop.loaded.tweets: {{count}} tweets
// i18n unbird.drop.loaded.likes: {{count}} likes
// i18n unbird.drop.loaded.following: following {{count}}
// i18n unbird.drop.loaded.notSaved: Not saved on this device (storage is blocked), so it won't be here if you leave.
// i18n unbird.drop.replace: Use a different archive
// i18n unbird.drop.forget: Forget it
// i18n unbird.drop.howToGet: Don't have it yet?
// i18n unbird.drop.howToGetBody: On Twitter, open Settings → Your account → Download an archive of your data. It usually arrives within a day.

/**
 * The front door of Unbird: one big target for the archive, and a calm line
 * about privacy instead of a page of warnings.
 */
@Component({
  selector: 'app-unbird-drop',
  imports: [MbButton, MbDisclosure, MbFileDrop, MbNotice, TranslocoPipe],
  templateUrl: './unbird-drop.html',
  styleUrl: './unbird-drop.css',
})
export class UnbirdDrop {
  protected readonly matcher = inject(UnbirdMatcher);
  protected readonly readFiles = READ_FILES;
  protected readonly step = signal<'opening' | 'reading' | 'sorting' | null>(null);
  protected readonly error = signal<'notArchive' | 'damaged' | null>(null);
  protected readonly notSaved = signal(false);
  /** Replacing: the drop target shows again over a loaded archive. */
  protected readonly replacing = signal(false);

  /** A new archive was read and adopted. */
  readonly loaded = output<UnbirdArchive>();

  protected readonly archive = this.matcher.archive;
  protected readonly showTarget = computed(() => !this.archive() || this.replacing());

  protected fmt(count: number | undefined): string {
    return (count ?? 0).toLocaleString();
  }

  protected onFiles(files: readonly MbPickedFile[]): void {
    void this.read(files.map(({ path, file }) => ({ path, blob: file })));
  }

  protected async forget(): Promise<void> {
    await this.matcher.forget();
    this.replacing.set(false);
  }

  private async read(files: PickedFile[]): Promise<void> {
    if (!files.length || this.step()) return;
    this.error.set(null);
    try {
      const archive = await readTwitterArchive(files, (step) => this.step.set(step));
      this.notSaved.set(!(await this.matcher.adopt(archive)));
      this.matcher.picked = files;
      this.replacing.set(false);
      this.loaded.emit(archive);
    } catch (error: unknown) {
      this.error.set(
        error instanceof ArchiveReadError || error instanceof SyntaxError
          ? 'notArchive'
          : 'damaged',
      );
      if (!(error instanceof ArchiveReadError || error instanceof ZipReadError)) {
        console.warn('Unbird could not read the archive', error);
      }
    } finally {
      this.step.set(null);
    }
  }
}
