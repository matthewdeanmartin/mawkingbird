import { describe, expect, it } from 'vitest';
import {
  groupOf,
  isGroupOwner,
  isSystemMessage,
  joinCodeFrom,
  joinLinkUrl,
  systemLine,
} from './bluesky-group-chat';
import { BskyChatMember, BskyMessageView } from './bluesky-types';

const members: BskyChatMember[] = [
  { did: 'did:plc:ana', handle: 'ana.test', displayName: 'Ana', kind: { role: 'owner' } },
  { did: 'did:plc:bo', handle: 'bo.test', kind: { role: 'standard' } },
];
const system = (type: string, data: Record<string, unknown> = {}) =>
  ({
    $type: 'chat.bsky.convo.defs#systemMessageView',
    data: { $type: `chat.bsky.convo.defs#systemMessageData${type}`, ...data },
  }) as unknown as BskyMessageView;

describe('Bluesky group chat helpers', () => {
  it('reads join links in bsky.app’s shape, and builds them', () => {
    expect(joinCodeFrom('https://bsky.app/chat/AbC123')).toBe('AbC123');
    expect(joinCodeFrom('bsky.app/chat/AbC123/')).toBe('AbC123');
    expect(joinCodeFrom('AbC123')).toBe('AbC123');
    expect(joinCodeFrom('https://example.com/chat/AbC123')).toBeNull();
    expect(joinLinkUrl('AbC123')).toBe('https://bsky.app/chat/AbC123');
  });

  it('tells a group from a 1:1 and finds its owner', () => {
    expect(
      groupOf({ kind: { $type: 'chat.bsky.convo.defs#groupConvo', name: 'G' } as never })?.name,
    ).toBe('G');
    expect(groupOf({ kind: { $type: 'chat.bsky.convo.defs#directConvo' } })).toBeNull();
    expect(groupOf({})).toBeNull();
    expect(isGroupOwner(members, 'did:plc:ana')).toBe(true);
    expect(isGroupOwner(members, 'did:plc:bo')).toBe(false);
  });

  it('turns system messages into lines, naming people from the message or the members', () => {
    expect(isSystemMessage(system('MemberJoin'))).toBe(true);
    expect(isSystemMessage({ $type: 'chat.bsky.convo.defs#messageView' })).toBe(false);
    expect(
      systemLine(
        system('AddMember', { addedBy: { did: 'did:plc:ana' }, member: 'did:plc:bo' }),
        members,
      ),
    ).toEqual({
      key: 'pages.conversations.group.system.added',
      params: { actor: 'Ana', member: 'bo.test' },
    });
    expect(systemLine(system('EditGroup', { newName: 'Birders' }), members).params).toEqual({
      name: 'Birders',
    });
    expect(
      systemLine(system('MemberLeave', { member: { did: 'did:plc:gone' } }), members).params,
    ).toEqual({
      member: 'did:plc:gone',
    });
    expect(systemLine(system('SomethingNew'), members).key).toBe(
      'pages.conversations.group.system.changed',
    );
  });
});
