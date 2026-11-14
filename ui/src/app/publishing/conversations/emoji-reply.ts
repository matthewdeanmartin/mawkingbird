import { Status } from '../../platform/api/models';

/** Only collapse unambiguous emoji-only replies; retain media, polls and warnings. */
export function emojiReply(status: Status): string | null {
  if (
    !status.in_reply_to_id ||
    status.media_attachments.length ||
    status.poll ||
    status.spoiler_text
  )
    return null;
  const doc = new DOMParser().parseFromString(status.content, 'text/html');
  doc.querySelectorAll('.h-card, .mention').forEach((node) => node.remove());
  let text = (doc.body.textContent ?? '')
    .replace(/^(?:\s*@[\w.-]+(?:@[\w.-]+)?[\s,:]*)+/, '')
    .trim();
  const original = text;
  for (const emoji of status.emojis ?? []) text = text.split(`:${emoji.shortcode}:`).join('');
  text = text
    .replace(/\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]\uFE0F?\u20E3/gu, '')
    .replace(/\s|\uFE0F|\u200D|[\u{1F3FB}-\u{1F3FF}]|[\u{E0020}-\u{E007F}]/gu, '');
  return original &&
    !text &&
    /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3|:[\w+-]+:/u.test(original)
    ? original
    : null;
}
