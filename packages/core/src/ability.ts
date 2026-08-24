import type { Member, MemberId, Status } from './member.ts';

/**
 * Everything the API gates on, named as `subject:verb`. A route asks for one of these and never
 * inspects a role or a status itself, so the rules live in exactly one table.
 *
 * The list is data rather than a written-out union, because an admin's abilities are the whole of
 * it: the union alone could not be enumerated, and the UI asks for exactly that enumeration.
 */
export const ACTIONS = [
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
  'club:manage',
  'audit:read',
] as const;

export type Action = (typeof ACTIONS)[number];

/**
 * What each status may do, cumulative down the list: an `active` member may do everything
 * `alumni` may. `admin` is a bypass rather than a row, because an admin is an admin whatever
 * their standing with the club.
 */
const PENDING = ['profile:read', 'profile:write'] as const;
const ALUMNI = [...PENDING, 'event:read', 'member:read', 'season:read'] as const;
const ACTIVE = [...ALUMNI, 'event:rsvp', 'event:create'] as const;

const GRANTS: Record<Status, readonly Action[]> = {
  pending: PENDING,
  alumni: ALUMNI,
  active: ACTIVE,
};

export class Ability {
  static readonly ACTIONS = ACTIONS;

  private constructor(private readonly member: Member | null) {}

  /** A signed-out visitor, who may do nothing. */
  static readonly ANONYMOUS = new Ability(null);

  static of(member: Member | null): Ability {
    return member ? new Ability(member) : Ability.ANONYMOUS;
  }

  can(action: Action): boolean {
    if (!this.member) return false;
    if (this.member.admin) return true;
    return GRANTS[this.member.status].includes(action);
  }

  /** An owner may always act on their own row, whatever the table says. */
  canOwn(action: Action, owner: MemberId): boolean {
    return this.member?.id === owner || this.can(action);
  }

  /**
   * Everything this caller may do, which is what `GET /me` answers with and what the SPA renders
   * from. An admin gets the whole list rather than a status row, because that is what the bypass
   * in `can` actually means: a UI built from a shorter list would hide buttons that work.
   */
  get actions(): readonly Action[] {
    if (!this.member) return [];
    if (this.member.admin) return ACTIONS;
    return GRANTS[this.member.status];
  }
}
