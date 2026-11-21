/**
 * Bluesky group chats (`chat.bsky.group.*`, spec/bsky_parity.md sprint 7):
 * the pure parts the conversations page needs. No API import.
 */
import type {
  BskyChatMember,
  BskyConvoView,
  BskyGroupConvo,
  BskyMessageView,
} from './bluesky-types';

/** `chat.bsky.group.defs#joinLinkPreviewView`, the parts shown before joining. */
export interface BskyJoinLinkPreview {
  convoId: string;
  code: string;
  name: string;
  owner: BskyChatMember;
  memberCount: number;
  memberLimit: number;
  requireApproval: boolean;
  /** Present when the reader is already in the group. */
  convo?: { id: string };
  /** `requestedAt` once the reader has asked to join. */
  viewer?: { requestedAt?: string };
}

/** A join link as people share it, the way bsky.app writes it. */
export function joinLinkUrl(code: string): string {
  return `https://bsky.app/chat/${encodeURIComponent(code)}`;
}

/** The code from a `bsky.app/chat/<code>` address, or a bare code; else null. */
export function joinCodeFrom(value: string): string | null {
  const trimmed = value.trim();
  const match = /^(?:https?:\/\/)?(?:www\.)?bsky\.app\/chat\/([A-Za-z0-9_-]+)\/?$/.exec(trimmed);
  if (match) return match[1];
  return /^[A-Za-z0-9_-]{4,}$/.test(trimmed) ? trimmed : null;
}

export function groupOf(convo: Pick<BskyConvoView, 'kind'>): BskyGroupConvo | null {
  const kind = convo.kind as BskyGroupConvo | undefined;
  return kind?.$type?.endsWith('#groupConvo') ? kind : null;
}

/** Whether `did` owns the group (only the owner manages it). */
export function isGroupOwner(members: readonly BskyChatMember[], did: string | undefined): boolean {
  return !!did && members.some((m) => m.did === did && m.kind?.role === 'owner');
}

export function isSystemMessage(m: Pick<BskyMessageView, '$type' | 'data'>): boolean {
  return !!m.$type?.endsWith('#systemMessageView') || !!m.data;
}

/** One line for a system message: an i18n key and its values. */
export interface SystemLine {
  key: string;
  params: Record<string, string>;
}

/**
 * A group's system message as words: who joined, left, was added or removed,
 * renamed the group, locked it, or changed its join link. Names come from the
 * message itself, else the member list, else the DID. Unknown kinds still say
 * something rather than vanish.
 */
export function systemLine(
  m: Pick<BskyMessageView, 'data'>,
  members: readonly BskyChatMember[],
): SystemLine {
  const data = m.data ?? {};
  const kind = (data.$type ?? '').split('#systemMessageData')[1] ?? '';
  const name = (value: unknown): string => {
    const person = value as Partial<BskyChatMember> | string | undefined;
    if (typeof person === 'string') return nameOf(person, members);
    if (!person) return '';
    return person.displayName || person.handle || (person.did ? nameOf(person.did, members) : '');
  };
  const who = (field: string) => name(data[field]);
  switch (kind) {
    case 'AddMember':
      return line('added', { actor: who('addedBy'), member: who('member') });
    case 'RemoveMember':
      return line('removed', { actor: who('removedBy'), member: who('member') });
    case 'MemberJoin':
      return line('joined', { member: who('member') });
    case 'MemberLeave':
      return line('left', { member: who('member') });
    case 'EditGroup':
      return line('renamed', { name: String(data['newName'] ?? '') });
    case 'LockConvo':
    case 'LockConvoPermanently':
      return line('locked', { actor: who('lockedBy') });
    case 'UnlockConvo':
      return line('unlocked', { actor: who('unlockedBy') });
    case 'CreateJoinLink':
    case 'EditJoinLink':
    case 'EnableJoinLink':
      return line('linkOn', {});
    case 'DisableJoinLink':
      return line('linkOff', {});
    default:
      return line('changed', {});
  }
}

function line(kind: string, params: Record<string, string>): SystemLine {
  return { key: `pages.conversations.group.system.${kind}`, params };
}

function nameOf(did: string, members: readonly BskyChatMember[]): string {
  const member = members.find((m) => m.did === did);
  return member?.displayName || member?.handle || did;
}
