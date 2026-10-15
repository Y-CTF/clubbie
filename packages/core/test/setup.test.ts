import { describe, expect, test } from 'bun:test';
import { Ability, type Facts, Id, Member, Setup } from '../src/index.ts';

const BARE: Facts = { club: false, events: 0, named: false, chat: false, season: null };

function ability(role: 'admin' | 'member', status: 'pending' | 'active') {
  return Ability.of(
    new Member({
      id: Id.create<'member'>(),
      name: 'Ada',
      email: 'ada@example.org',
      avatar: null,
      organisation: null,
      welcomed: false,
      role,
      status,
      hidden: false,
      createdAt: new Date(),
    }),
  );
}

const steps = (who: Ability, facts = BARE) =>
  Setup.list((action) => who.can(action), facts).map((item) => item.step);

describe('Setup', () => {
  test('an admin is asked for the club and then for themselves', () => {
    expect(steps(ability('admin', 'active'))).toEqual(['club', 'event', 'name', 'chat']);
  });

  test('an ordinary member is never asked to build the club', () => {
    expect(steps(ability('member', 'active'))).toEqual(['name', 'chat']);
  });

  test('a member waiting to be admitted is asked only for what a pending member may do', () => {
    expect(steps(ability('member', 'pending'))).toEqual(['name', 'chat']);
  });

  /** A second admin joining a club that is already set up has nothing outstanding about it. */
  test('a step is ticked from the facts, so a named club is done for whoever arrives next', () => {
    const items = Setup.list((action) => ability('admin', 'active').can(action), {
      ...BARE,
      club: true,
      events: 3,
    });

    expect(
      items.filter((item) => item.step === 'club' || item.step === 'event').every((item) => item.done),
    ).toBe(true);
    expect(Setup.left(items)).toBe(2);
  });

  test('a season the member cannot join is not on the list at all', () => {
    expect(steps(ability('member', 'active'), { ...BARE, season: null })).not.toContain('season');
    expect(steps(ability('member', 'active'), { ...BARE, season: false })).toContain('season');
  });

  test('everything done leaves nothing', () => {
    const items = Setup.list((action) => ability('admin', 'active').can(action), {
      club: true,
      events: 1,
      named: true,
      chat: true,
      season: true,
    });

    expect(Setup.left(items)).toBe(0);
  });
});
