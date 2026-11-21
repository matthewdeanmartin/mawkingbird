import { computed, effect, inject, Injectable, InjectionToken, signal } from '@angular/core';
import { Wellness } from './wellness';
import {
  addActive,
  grayLevel,
  IDLE_AFTER_MS,
  normalizeUsage,
  SITTING_GAP_MS,
  UsageRecord,
} from './usage-clock-model';

/** Per device, never synced or exported (see usage-clock-model.ts). */
export const USAGE_KEY = 'mockingbird_usage_today';

/** How often activity is sampled. Each active sample adds the time since the last. */
export const USAGE_TICK_MS = 15_000;

/** Is the person using the app right now? */
export interface ActivitySource {
  /** Which signal this is, for diagnostics and the settings page. */
  readonly kind: 'os' | 'browser';
  active(): Promise<boolean>;
}

interface TauriBridge {
  core: { invoke<T>(command: string, args?: object): Promise<T> };
}

/**
 * The browser can only see its own tab: visible, focused, and some input in
 * the last two minutes. A window left open while someone walks away stops
 * counting after two minutes, which is as close as a page can get.
 */
export class BrowserActivity implements ActivitySource {
  readonly kind = 'browser' as const;
  private lastInput = Date.now();

  constructor() {
    const mark = (): void => {
      this.lastInput = Date.now();
    };
    for (const name of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'scroll', 'touchstart']) {
      window.addEventListener(name, mark, { passive: true, capture: true });
    }
  }

  active(): Promise<boolean> {
    const visible = document.visibilityState === 'visible';
    const focused = typeof document.hasFocus !== 'function' || document.hasFocus();
    return Promise.resolve(visible && focused && this.recentInput());
  }

  /** Some input inside this page within the idle limit. */
  recentInput(): boolean {
    return Date.now() - this.lastInput < IDLE_AFTER_MS;
  }
}

/**
 * Native (Sprint 17 in mawkingbird_native): the host knows whether our window
 * really has focus (WebView2 reports "visible" for a window behind others).
 * OS idle time is `null` until the owner approves reading it; then input
 * inside our window decides, which is equivalent while we have focus. Falls
 * back to the browser signal entirely if the command is missing (an older
 * Native build) or fails.
 */
export class NativeActivity implements ActivitySource {
  readonly kind = 'os' as const;
  private fallback = new BrowserActivity();
  private unsupported = false;

  constructor(private bridge: TauriBridge) {}

  async active(): Promise<boolean> {
    if (this.unsupported) return this.fallback.active();
    try {
      const state = await this.bridge.core.invoke<{
        focused: boolean;
        idle_seconds: number | null;
      }>('wellness_activity');
      if (!state.focused) return false;
      return state.idle_seconds === null
        ? this.fallback.recentInput()
        : state.idle_seconds * 1000 < IDLE_AFTER_MS;
    } catch {
      this.unsupported = true;
      return this.fallback.active();
    }
  }
}

export const ACTIVITY_SOURCE = new InjectionToken<ActivitySource>('ActivitySource', {
  providedIn: 'root',
  factory: () => {
    const bridge = (window as { __TAURI__?: TauriBridge }).__TAURI__;
    return bridge?.core ? new NativeActivity(bridge) : new BrowserActivity();
  },
});

/**
 * Today's active time on this device, and the current sitting.
 *
 * Runs only while a time-aware Wellness switch is on: nobody else's usage is
 * measured, stored or even sampled.
 */
@Injectable({ providedIn: 'root' })
export class UsageClock {
  private wellness = inject(Wellness);
  private source = inject(ACTIVITY_SOURCE);

  private readonly record = signal<UsageRecord>(this.read());
  /** When the current sitting began (epoch ms), or null before any activity. */
  private readonly sittingStart = signal<number | null>(null);
  private readonly now = signal(Date.now());
  private lastTick = Date.now();
  private lastActive: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Some time-aware switch needs the clock. */
  readonly needed = computed(() => {
    const flags = this.wellness.flags();
    return flags.checkIn || flags.breakReminders || flags.autoGrayscale;
  });

  readonly todayMinutes = computed(() => Math.floor(this.record().ms / 60_000));
  readonly sittingMinutes = computed(() => {
    const start = this.sittingStart();
    return start === null ? 0 : Math.floor((this.now() - start) / 60_000);
  });
  /** 0–1 auto-grayscale, or 0 when the switch is off. */
  readonly gray = computed(() =>
    this.wellness.flags().autoGrayscale ? grayLevel(this.todayMinutes()) : 0,
  );

  constructor() {
    effect(() => {
      if (this.needed()) this.start();
      else this.stop();
    });
  }

  /** One sample, exposed for tests and for Native's focus events. */
  async tick(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastTick;
    this.lastTick = now;
    const active = await this.source.active();
    this.now.set(now);
    if (!active) return;
    if (this.lastActive === null || now - this.lastActive > SITTING_GAP_MS) {
      this.sittingStart.set(now);
    }
    this.lastActive = now;
    const next = addActive(this.record(), elapsed, now, USAGE_TICK_MS * 2);
    this.record.set(next);
    try {
      localStorage.setItem(USAGE_KEY, JSON.stringify(next));
    } catch {
      // The clock still runs for this tab.
    }
  }

  /** Minutes since the last active sample, or null if none yet (check-in uses it). */
  awayMinutes(): number | null {
    return this.lastActive === null ? null : Math.floor((Date.now() - this.lastActive) / 60_000);
  }

  private start(): void {
    if (this.timer !== null) return;
    this.lastTick = Date.now();
    this.timer = setInterval(() => void this.tick(), USAGE_TICK_MS);
  }

  private stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  private read(): UsageRecord {
    try {
      return normalizeUsage(JSON.parse(localStorage.getItem(USAGE_KEY) ?? 'null'), Date.now());
    } catch {
      return normalizeUsage(null, Date.now());
    }
  }
}
