import { describe, expect, it } from 'vitest';
import { emojiReply } from './emoji-reply';
import { Status } from '../../platform/api/models';

describe('emojiReply', () => {
  const status = (content: string, extra: Partial<Status> = {}) =>
    ({
      content,
      in_reply_to_id: 'parent',
      media_attachments: [],
      emojis: [],
      ...extra,
    }) as Status;

  it('recognizes skin tones, flags, joined emoji, keycaps and custom emoji after mentions', () => {
    for (const emoji of ['👍🏽', '🇬🇧', '👩‍💻', '1️⃣', '❤️ 🎉']) {
      expect(emojiReply(status(`<p>@friend@example.org ${emoji}</p>`))).toBe(emoji);
    }
    expect(
      emojiReply(
        status('<p><span class="h-card">@friend</span> :wave:</p>', {
          emojis: [{ shortcode: 'wave', url: '', static_url: '', visible_in_picker: true }],
        }),
      ),
    ).toBe(':wave:');
  });

  it('preserves text, media, warnings, polls and ordinary root messages', () => {
    for (const text of ['thanks 👍', ':) right on', '😀 right on', '123', ':unknown:', 'hello', ''])
      expect(emojiReply(status(text))).toBeNull();
    expect(emojiReply(status('👍', { in_reply_to_id: null }))).toBeNull();
    expect(emojiReply(status('👍', { spoiler_text: 'warning' }))).toBeNull();
    expect(
      emojiReply(status('👍', { media_attachments: [{}] as Status['media_attachments'] })),
    ).toBeNull();
    expect(emojiReply(status('👍', { poll: {} as NonNullable<Status['poll']> }))).toBeNull();
  });
});
