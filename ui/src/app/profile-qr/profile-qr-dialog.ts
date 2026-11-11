import {
  Component,
  ElementRef,
  inject,
  input,
  OnDestroy,
  OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { accountProfilePath } from '../account-route';
import { Api } from '../api';
import { MbButton } from '../design-system/button/button';
import { MbDialog } from '../design-system/dialog/dialog';
import { MbNotice } from '../design-system/notice/notice';
import { cameraScanSupported, scannedAccountQuery } from './profile-qr';

// i18n profileQr.title: Profile QR code
// i18n profileQr.scanTitle: Scan a profile QR code
// i18n profileQr.alt: QR code for {{url}}
// i18n profileQr.caption: Scan this with a phone camera or another fediverse app to open @{{acct}}.
// i18n profileQr.close: Close
// i18n profileQr.copy: Copy link
// i18n profileQr.copied: Link copied
// i18n profileQr.scan: Scan a code
// i18n profileQr.back: Show my code
// i18n profileQr.starting: Starting the camera…
// i18n profileQr.pointCamera: Point the camera at a profile QR code.
// i18n profileQr.cameraError: Could not use the camera. Check that this site may use it, then try again.
// i18n profileQr.found: Found {{text}}
// i18n profileQr.notProfile: That code is not a profile link: {{text}}
// i18n profileQr.openProfile: Open profile
// i18n profileQr.opening: Looking it up…
// i18n profileQr.notFound: Your server could not find that account.

type DetectedCode = { rawValue: string };
type Detector = { detect(source: CanvasImageSource): Promise<DetectedCode[]> };
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

/** How often to look at a camera frame. Decoding every frame burns battery for nothing. */
const SCAN_INTERVAL_MS = 250;

/**
 * Show a profile link as a QR code and, where a camera exists, scan someone
 * else's code and open their profile through the signed-in server.
 */
@Component({
  selector: 'app-profile-qr-dialog',
  imports: [MbDialog, MbButton, MbNotice, TranslocoPipe],
  templateUrl: './profile-qr-dialog.html',
  styleUrl: './profile-qr-dialog.css',
})
export class ProfileQrDialog implements OnInit, OnDestroy {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly transloco = inject(TranslocoService);

  /** The canonical profile URL to encode. */
  readonly url = input.required<string>();
  readonly acct = input.required<string>();
  readonly closed = output<void>();

  protected readonly canScan = cameraScanSupported();
  protected readonly qrImage = signal('');
  protected readonly copied = signal(false);
  protected readonly mode = signal<'show' | 'scan'>('show');
  protected readonly cameraState = signal<'starting' | 'live' | 'error'>('starting');
  protected readonly scanned = signal('');
  protected readonly scannedQuery = signal<string | null>(null);
  protected readonly opening = signal(false);
  protected readonly openError = signal('');

  private readonly video = viewChild<ElementRef<HTMLVideoElement>>('video');
  private stream: MediaStream | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  async ngOnInit(): Promise<void> {
    // `qr` is loaded on demand so profiles never pay for it until asked.
    const { default: encodeQR } = await import('qr');
    if (this.destroyed) return;
    this.qrImage.set(encodeQR(this.url(), 'data-url', { ecc: 'medium', scale: 8, border: 2 }));
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.stopCamera();
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.url());
      this.copied.set(true);
    } catch {
      this.copied.set(false);
    }
  }

  protected showCode(): void {
    this.stopCamera();
    this.mode.set('show');
  }

  protected async startScan(): Promise<void> {
    this.mode.set('scan');
    this.cameraState.set('starting');
    this.scanned.set('');
    this.scannedQuery.set(null);
    this.openError.set('');
    try {
      const Detector = await loadDetector();
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      if (this.destroyed || this.mode() !== 'scan') {
        this.stopCamera();
        return;
      }
      const video = this.video()?.nativeElement;
      if (!video) throw new Error('No video element');
      video.srcObject = this.stream;
      await video.play();
      this.cameraState.set('live');
      this.scanLoop(video, new Detector({ formats: ['qr_code'] }));
    } catch {
      this.stopCamera();
      this.cameraState.set('error');
    }
  }

  private scanLoop(video: HTMLVideoElement, detector: Detector): void {
    const canvas = document.createElement('canvas');
    const tick = async (): Promise<void> => {
      if (!this.stream || this.destroyed) return;
      if (video.videoWidth && video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext('2d')?.drawImage(video, 0, 0);
        try {
          const [code] = await detector.detect(canvas);
          if (code?.rawValue && code.rawValue !== this.scanned()) {
            this.scanned.set(code.rawValue);
            this.scannedQuery.set(scannedAccountQuery(code.rawValue));
            this.openError.set('');
          }
        } catch {
          // A frame that fails to decode is ordinary; keep looking.
        }
      }
      if (this.stream) this.timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS);
    };
    void tick();
  }

  private stopCamera(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
  }

  /** Resolve the scanned profile on the signed-in server and open it in-app. */
  protected async openScanned(): Promise<void> {
    const query = this.scannedQuery();
    if (!query || this.opening()) return;
    this.opening.set(true);
    this.openError.set('');
    try {
      const results = await firstValueFrom(
        this.api.search(query, 'accounts', { resolve: true, limit: 1 }),
      );
      const account = results.accounts[0];
      if (!account) {
        this.openError.set(this.transloco.translate('profileQr.notFound'));
        return;
      }
      this.stopCamera();
      this.closed.emit();
      await this.router.navigate(accountProfilePath(account));
    } catch {
      this.openError.set(this.transloco.translate('profileQr.notFound'));
    } finally {
      this.opening.set(false);
    }
  }
}

async function loadDetector(): Promise<DetectorConstructor> {
  const native = (globalThis as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
  if (native) return native;
  // The `qr` package ships a BarcodeDetector-compatible decoder for browsers
  // without one (Firefox, Safari).
  const polyfill = await import('qr/decode.js');
  return polyfill.BarcodeDetector as unknown as DetectorConstructor;
}
