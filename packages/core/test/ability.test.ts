import { describe, expect, test } from 'bun:test';
import { Ability, type Action, Id, Member, type Role, type Status } from '../src/index.ts';

function member(role: Role, status: Status): Member {
  return new Member({
    id: Id.create<'member'>(),
    name: 'Ada',
    email: 'ada@example.org',
    avatar: null,
    organisation: null,
    role,
    status,
    hidden: false,
    createdAt: new Date(),
  });
}

describe('Ability', () => {
  test('a signed-out visitor may do nothing', () => {
    for (const action of ACTIONS) expect(Ability.ANONYMOUS.can(action)).toBe(false);
  });

  test('a pending member may only read and edit their own profile', () => {
    const ability = Ability.of(member('member', 'pending'));
    expect(ability.can('profile:write')).toBe(true);
    expect(ability.can('event:read')).toBe(false);
    expect(ability.can('event:rsvp')).toBe(false);
  });

  test('an alumni reads but does not answer', () => {
    const ability = Ability.of(member('member', 'alumni'));
    expect(ability.can('event:read')).toBe(true);
    expect(ability.can('event:rsvp')).toBe(false);
  });

  test('an active member answers and organises', () => {
    const ability = Ability.of(member('member', 'active'));
    expect(ability.can('event:rsvp')).toBe(true);
    expect(ability.can('event:create')).toBe(true);
    expect(ability.can('member:manage')).toBe(false);
  });

  test('an admin bypasses status', () => {
    for (const status of Member.STATUSES) {
      const ability = Ability.of(member('admin', status));
      for (const action of ACTIONS) expect(ability.can(action)).toBe(true);
    }
  });

  test('an owner acts on their own row whatever the table says', () => {
    const pending = member('member', 'pending');
    expect(Ability.of(pending).canOwn('event:manage', pending.id)).toBe(true);
    expect(Ability.of(pending).canOwn('event:manage', Id.create<'member'>())).toBe(false);
  });
});

const ACTIONS: readonly Action[] = [
  'profile:read',
  'profile:write',
  'event:read',
  'event:rsvp',
  'event:create',
  'event:manage',
  'member:read',
  'member:manage',
  'season:read',
  'season:manage',
];
