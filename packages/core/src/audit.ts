import type { Id } from './id.ts';
import type { MemberId } from './member.ts';

export type AuditId = Id<'audit'>;

/**
 * Every act an organiser can take that somebody may ask about three months later: who admitted
 * whom, who deleted that event, who marked that person present.
 *
 * Reads are not recorded. A log of who looked at the roster is a surveillance feature, and the
 * question a club actually asks is always about a change.
 */
export const ACTS = [
  'member.admit',
  /** A member who is no longer active. Recorded as itself: retiring is not admitting. */
  'member.retire',
  'member.role',
  'member.remove',
  'event.create',
  'event.update',
  'event.delete',
  'event.announce',
  'attendance.mark',
  'guest.add',
  'guest.remove',
  'season.create',
  'season.promote',
  'season.roster',
  'season.delete',
  'schedule.create',
  'schedule.update',
  'schedule.delete',
  'club.update',
  'job.retry',
  'job.discard',
  'asset.add',
  'asset.remove',
  'kind.create',
  'kind.update',
  'kind.delete',
] as const;
export type Act = (typeof ACTS)[number];

export interface AuditFields {
  readonly id: AuditId;
  readonly act: Act;
  /** Who did it. Null only for something the scheduler did on nobody's behalf. */
  readonly actorId: MemberId | null;
  /** The id of whatever it was done to, so a trail can be read back for one event or member. */
  readonly subject: string | null;
  /** What changed, as the fields that changed and nothing else. */
  readonly detail: Readonly<Record<string, unknown>>;
  readonly at: Date;
}

/** The fields are declared once, in `AuditFields`; the class carries them by declaration merging. */
export interface Audit extends AuditFields {}

export class Audit {
  static readonly ACTS = ACTS;
  /** How many entries a page of the trail holds. */
  static readonly PAGE = 100;
  /** How many entries a screen shows at once, which is fewer than a page the API will serve. */
  static readonly WINDOW = 20;

  constructor(fields: AuditFields) {
    Object.assign(this, fields);
  }
}
