import { Injectable, signal } from '@angular/core';
import { htmlToPlainText } from '../../translation/ai-translate';
import { Status } from '../../platform/api/models';

/**
 * What to say for a post: the content warning, the text, then each image
 * description introduced as such. Links are read as their site name; a spoken
 * "h t t p s colon slash slash" helps nobody.
 */
export function speechText(status: Status, imageLabel = 'Image'): string {
  const post = status.reblog ?? status;
  const body = htmlToPlainText(post.content)
    .replace(/https?:\/\/(?:www\.)?([^/\s]+)\S*/giu, '$1')
    .trim();
  const parts = [post.spoiler_text?.trim(), body].filter(Boolean) as string[];
  for (const media of post.media_attachments ?? []) {
    const alt = media.description?.trim();
    if (alt) parts.push(`${imageLabel}: ${alt}`);
  }
  for (const option of post.poll?.options ?? []) parts.push(option.title);
  return parts.join('\n\n');
}

/**
 * Read text aloud with the browser's speech synthesis. One thing speaks at a
 * time; starting another stops the first. Nothing leaves the device.
 */
@Injectable({ providedIn: 'root' })
export class SpeechReader {
  private readonly synth: SpeechSynthesis | null =
    typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

  /** Whether this browser can speak at all. */
  readonly supported = !!this.synth && typeof SpeechSynthesisUtterance !== 'undefined';
  /** Key of what is being read now (a status id), or null. */
  readonly speaking = signal<string | null>(null);

  speak(key: string, text: string, lang?: string | null): void {
    if (!this.synth || !text.trim()) return;
    this.synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (lang && lang !== 'und') {
      utterance.lang = lang;
      const voice = this.voiceFor(lang);
      if (voice) utterance.voice = voice;
    }
    const done = () => {
      if (this.speaking() === key) this.speaking.set(null);
    };
    utterance.onend = done;
    utterance.onerror = done;
    this.speaking.set(key);
    this.synth.speak(utterance);
  }

  stop(): void {
    this.synth?.cancel();
    this.speaking.set(null);
  }

  /** Prefer a local voice in the post's language; the browser picks otherwise. */
  private voiceFor(lang: string): SpeechSynthesisVoice | undefined {
    const voices = this.synth?.getVoices() ?? [];
    const base = lang.toLowerCase().split('-')[0];
    const matching = voices.filter((v) => v.lang.toLowerCase().split('-')[0] === base);
    return matching.find((v) => v.localService) ?? matching[0];
  }
}
