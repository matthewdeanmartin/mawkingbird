import { Injectable, OnDestroy, signal } from '@angular/core';
import { Relationship, Status } from '../../platform/api/models';

/** Session opt-in also supplies the browser gesture needed to unlock audio. */
@Injectable({ providedIn: 'root' })
export class ChatSound implements OnDestroy {
  readonly enabled = signal(false);
  private context: AudioContext | null = null;
  private enabledAt = Infinity;
  private lastPlayed = -Infinity;
  private seen = new Set<string>();

  toggle(): void {
    if (this.enabled()) {
      this.enabled.set(false);
      return;
    }
    if (typeof AudioContext === 'undefined') return;
    this.context ??= new AudioContext();
    void this.context
      .resume()
      .then(() => {
        this.enabledAt = Date.now();
        this.enabled.set(true);
      })
      .catch(() => undefined);
  }

  receive(
    status: Status,
    relationship: Relationship | undefined,
    ownId: string | undefined,
    suppressed: boolean,
  ): void {
    if (!this.enabled() || this.seen.has(status.id)) return;
    this.seen.add(status.id);
    if (this.seen.size > 2000) this.seen.delete(this.seen.values().next().value!);
    if (
      Date.parse(status.created_at) < this.enabledAt ||
      status.account.id === ownId ||
      suppressed ||
      !relationship?.following ||
      !relationship.followed_by ||
      relationship.muting ||
      relationship.blocking ||
      Date.now() - this.lastPlayed < 10_000 ||
      this.context?.state !== 'running'
    )
      return;
    this.lastPlayed = Date.now();
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    const now = this.context.currentTime;
    oscillator.frequency.setValueAtTime(660, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
    };
    oscillator.start(now);
    oscillator.stop(now + 0.2);
  }

  ngOnDestroy(): void {
    void this.context?.close();
  }
}
