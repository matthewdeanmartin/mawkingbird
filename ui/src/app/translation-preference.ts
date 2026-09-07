import { Injectable, signal } from '@angular/core';

/**
 * Which translator the 🌐 button uses.
 *
 * Signed-in users already have server translation — free to them, already wired,
 * already what they clicked yesterday. So the default is `server` and AI is opt-in:
 * a settings default does not get to sign someone up for a paid API. See
 * `sprint/anonymous-great-0-overview.md` decision 7.
 *
 * Anonymous users don't consult this at all. `POST /statuses/:id/translate` needs a
 * token, so there is no server option to prefer — AI is the only translator they
 * have, and the button goes straight to it.
 *
 * Unscoped, matching the OpenRouter connection it leans on: the key belongs to the
 * human and works the same signed in, signed in as an alt, or Anonymous.
 */

const PREFERENCE_KEY = 'mockingbird_translation_preference';

export type TranslationChoice =
  /** Ask each time, with a "remember this" option in the chooser. */
  | 'ask'
  /** Straight to OpenRouter. */
  | 'ai'
  /** Straight to the server's own translation. The default. */
  | 'server';

const CHOICES: readonly TranslationChoice[] = ['ask', 'ai', 'server'];

export const DEFAULT_TRANSLATION_CHOICE: TranslationChoice = 'server';

function read(): TranslationChoice {
  try {
    const raw = localStorage.getItem(PREFERENCE_KEY);
    // A value we don't recognise (hand-edited, or written by a future version)
    // falls back to the safe default rather than throwing or trusting it.
    return CHOICES.includes(raw as TranslationChoice)
      ? (raw as TranslationChoice)
      : DEFAULT_TRANSLATION_CHOICE;
  } catch {
    return DEFAULT_TRANSLATION_CHOICE;
  }
}

@Injectable({ providedIn: 'root' })
export class TranslationPreference {
  readonly choice = signal<TranslationChoice>(read());

  readonly options: readonly { value: TranslationChoice; label: string; hint: string }[] = [
    {
      value: 'server',
      label: 'Your server',
      hint: "Uses the instance's own translation. Free, and needs no setup.",
    },
    {
      value: 'ai',
      label: 'AI (OpenRouter)',
      hint: 'Uses the model you picked. Spends OpenRouter credits per translation.',
    },
    { value: 'ask', label: 'Ask each time', hint: 'Choose per post.' },
  ];

  set(choice: TranslationChoice): void {
    if (!CHOICES.includes(choice)) {
      return;
    }
    try {
      if (choice === DEFAULT_TRANSLATION_CHOICE) {
        // Storing the default is the same as having no preference; not writing it
        // keeps the key absent for everyone who never chose, which is what the
        // storage inspector should show.
        localStorage.removeItem(PREFERENCE_KEY);
      } else {
        localStorage.setItem(PREFERENCE_KEY, choice);
      }
    } catch {
      // Non-persistent, but honour it for this session.
    }
    this.choice.set(choice);
  }

  reset(): void {
    this.set(DEFAULT_TRANSLATION_CHOICE);
  }
}
