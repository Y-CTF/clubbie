import type { Id } from './id.ts';

export type MemberId = Id<'member'>;

/** What a member may be trusted with. Orthogonal to `Status`, which says whether they are current. */
export const ROLES = ['admin', 'member'] as const;
export type Role = (typeof ROLES)[number];

/**
 * Where a member stands with the club. `pending` has signed in but nobody has admitted them yet,
 * `alumni` was a member and keeps read access, and only `active` counts against a season roster.
 */
export const STATUSES = ['pending', 'active', 'alumni'] as const;
export type Status = (typeof STATUSES)[number];

export interface MemberFields {
  readonly id: MemberId;
  readonly name: string;
  readonly email: string;
  readonly avatar: string | null;
  readonly role: Role;
  readonly status: Status;
  /** Hides this member from public attendance listings. Organisers still see them. */
  readonly hidden: boolean;
  readonly createdAt: Date;
  /**
   * The institution this identity signed in from, as a domain, when the provider says. It is kept
   * rather than only checked: a committee looking at a roster of two hundred wants to know which
   * faculty somebody is from, and the answer was thrown away the moment the door said yes.
   */
  readonly organisation: string | null;
  /** Whether they have been through the first run or said not to be shown it again. */
  readonly welcomed: boolean;
}

/** The fields are declared once, in `MemberFields`, and the class carries them by declaration
 * merging: adding a column is one edit here rather than three. */
export interface Member extends MemberFields {}

export class Member {
  static readonly ROLES = ROLES;
  static readonly STATUSES = STATUSES;
  /** How many members one edit may touch, which is a screenful and not a database. */
  static readonly BATCH = 200;
  /** How many one page of the roster holds. A club of tens to hundreds, in one or two pages. */
  static readonly PAGE = 200;
  /** What a member is when the club first sees them: known, but not yet admitted. */
  static readonly INITIAL: Status = 'pending';
  /** The one status that counts against a roster, and the only one that hears announcements. */
  static readonly ACTIVE: Status = 'active';
  static readonly ORDINARY: Role = 'member';
  /** The role that decides everything, which is why nothing writes it as a bare word. */
  static readonly ADMIN: Role = 'admin';

  constructor(fields: MemberFields) {
    Object.assign(this, fields);
  }

  get admin(): boolean {
    return this.role === Member.ADMIN;
  }

  /**
   * Whether they have said what to call them. Enrolling by address leaves the address as the name,
   * because that is all it was told, so the two being equal is exactly "they have not".
   */
  get named(): boolean {
    return this.name !== this.email;
  }

  get active(): boolean {
    return this.status === Member.ACTIVE;
  }

  is(other: MemberId): boolean {
    return this.id === other;
  }
}
