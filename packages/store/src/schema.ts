import type {
  Act,
  Answer,
  AssetId,
  AuditId,
  EventId,
  Frequency,
  GuestId,
  JobId,
  JobKind,
  JobState,
  KindId,
  MemberId,
  Role,
  ScheduleId,
  SeasonId,
  SigninId,
  State,
  Status,
} from '@clubbie/core';

/**
 * Column names are camelCase and Kysely quotes every identifier, so one vocabulary reaches
 * both dialects and no query has to alias anything.
 *
 * Two column types carry the portability: an instant is epoch milliseconds in a `bigint`, and a
 * flag is 0 or 1 in an `integer`. SQLite has neither a date nor a boolean, and Postgres returns
 * its own objects for both, so anything richer would decode differently per dialect. The repo
 * layer is the only place that converts, and nothing above it sees a number.
 */
export interface Schema {
  migration: MigrationTable;
  member: MemberTable;
  account: AccountTable;
  session: SessionTable;
  season: SeasonTable;
  membership: MembershipTable;
  event: EventTable;
  rsvp: RsvpTable;
  link: LinkTable;
  signin: SigninTable;
  telegram: TelegramTable;
  asset: AssetTable;
  club: ClubTable;
  kind: KindTable;
  schedule: ScheduleTable;
  guest: GuestTable;
  job: JobTable;
  audit: AuditTable;
  preference: PreferenceTable;
}

export interface MigrationTable {
  version: number;
  name: string;
  appliedAt: number;
}

export interface MemberTable {
  id: MemberId;
  name: string;
  email: string;
  avatar: string | null;
  role: Role;
  status: Status;
  hidden: number;
  createdAt: number;
  /** The institution the identity came from, when the provider says which. */
  organisation: string | null;
}

/** An identity at an OAuth provider. A member may hold one per provider. */
export interface AccountTable {
  provider: string;
  subject: string;
  memberId: MemberId;
  linkedAt: number;
}

/** `id` is the SHA-256 of the bearer token, never the token: a leaked table grants nothing. */
export interface SessionTable {
  id: string;
  memberId: MemberId;
  expiresAt: number;
  createdAt: number;
}

export interface SeasonTable {
  id: SeasonId;
  name: string;
  startsAt: number;
  endsAt: number;
  current: number;
  renewalAt: number | null;
  createdAt: number;
}

export interface MembershipTable {
  memberId: MemberId;
  seasonId: SeasonId;
  joinedAt: number;
}

export interface EventTable {
  id: EventId;
  title: string;
  description: string | null;
  kind: KindId;
  state: State;
  startsAt: number;
  endsAt: number | null;
  closesAt: number | null;
  location: string | null;
  capacity: number | null;
  seasonId: SeasonId | null;
  scheduleId: ScheduleId | null;
  listed: number;
  createdBy: MemberId;
  createdAt: number;
}

export interface RsvpTable {
  eventId: EventId;
  memberId: MemberId;
  answer: Answer;
  attendedAt: number | null;
  answeredAt: number;
}

/** A short-lived code a member carries to a chat platform to prove who they are. */
export interface LinkTable {
  token: string;
  memberId: MemberId;
  expiresAt: number;
  usedAt: number | null;
}

/**
 * One request to sign in by address. Both secrets are held as digests, and `tries` bounds how
 * often the short one may be guessed at before the row is spent.
 */
export interface SigninTable {
  id: SigninId;
  email: string;
  token: string;
  code: string;
  tries: number;
  expiresAt: number;
  usedAt: number | null;
}

export interface TelegramTable {
  memberId: MemberId;
  chatId: string;
  username: string | null;
  linkedAt: number;
}

/**
 * The club's own vocabulary for what an event is. The id is a slug an event stores; the label is
 * what a committee typed and may retype, which is why they are two columns.
 */
export interface KindTable {
  id: KindId;
  label: string;
  position: number;
}

/** One row, keyed by `Club.ROW`: one deployment is one club, so there is nothing to key on. */
export interface ClubTable {
  id: string;
  name: string;
  tagline: string | null;
  accent: string;
  /** The page's own background, when a club names one. Null is the neutral `Design` mixes. */
  paper: string | null;
  logo: string | null;
  listed: number;
  locale: string | null;
  timezone: string | null;
  /** The rest of the look, each one a name from a closed list in `Design`. */
  palette: string | null;
  font: string | null;
  /**
   * What used to be `radius` and `density`: three-word scales, kept for a release that reads this
   * database and does not know about the numbers. Nothing in this release writes them.
   */
  radius: string | null;
  density: string | null;
  /** The measures, each null until a committee moves the slider. `Design` owns what null means. */
  corner: number | null;
  space: number | null;
  hue: number | null;
  tint: number | null;
  scale: number | null;
  width: string | null;
  display: string | null;
  motion: number | null;
  /**
   * Added by migration 11 and never used: it said what `listed` already says, which is whether a
   * signed-out visitor sees the next few events. The column stays because migrations are
   * append-only; nothing reads it and nothing writes it.
   */
  showcase: number | null;
  /** The club's own navigation links, as JSON: a list this short is not worth a table. */
  links: string | null;
  footer: string | null;
  banner: string | null;
  blurb: string | null;
  /**
   * Which academic organisations may sign in, as one line of comma-separated eduID home domains.
   * Empty or null is everybody, which is what a club that has not thought about it wants.
   */
  organisations: string | null;
  /** What happens to a first sign-in: null reads as `review`, which is what waiting means. */
  admission: string | null;
  /** The rest of the door, each a comma-separated line and each null until a club writes one. */
  domains: string | null;
  allowed: string | null;
  blocked: string | null;
  providers: string | null;
  /** How an evening runs by default: hours, hours, and two flags. Null reads as `Club`'s own. */
  deadline: number | null;
  remind: number | null;
  guests: number | null;
  waitlist: number | null;
  updatedAt: number;
}

/**
 * An image the club uploaded, kept in the database rather than on a disk.
 *
 * It is base64 text rather than a blob because a blob is the one column type the two dialects
 * hand back differently (a `Buffer` here, a `Uint8Array` there, and `bun:sqlite` and `node:sqlite`
 * disagree again), and this app's whole promise is that a Postgres url is a url change. A logo and
 * a banner are tens of kilobytes; `Assets.LIMIT` is what stops that becoming a file server.
 */
export interface AssetTable {
  id: AssetId;
  /** The image type, from a closed list: what the answer's `content-type` is set to. */
  mime: string;
  /** The bytes, base64 encoded. */
  body: string;
  /** The decoded size, so a listing does not have to decode to say how big something is. */
  bytes: number;
  uploadedBy: MemberId;
  uploadedAt: number;
}

/** The template and rule occurrences are stamped from. The occurrences themselves are events. */
export interface ScheduleTable {
  id: ScheduleId;
  title: string;
  description: string | null;
  kind: KindId;
  location: string | null;
  capacity: number | null;
  seasonId: SeasonId | null;
  startsAt: number;
  minutes: number | null;
  freq: Frequency;
  interval: number;
  count: number | null;
  until: number | null;
  listed: number;
  createdBy: MemberId;
  createdAt: number;
}

export interface GuestTable {
  id: GuestId;
  eventId: EventId;
  name: string;
  email: string | null;
  invitedBy: MemberId;
  attendedAt: number | null;
  createdAt: number;
}

/** `payload` is JSON text: one column reaches both dialects, and the shape is `Payloads`. */
export interface JobTable {
  id: JobId;
  kind: JobKind;
  payload: string;
  subject: string | null;
  runAt: number;
  state: JobState;
  /** When the queue handed this job out, so a lease that expired can be handed out again. */
  claimedAt: number | null;
  attempts: number;
  error: string | null;
  createdAt: number;
}

export interface AuditTable {
  id: AuditId;
  act: Act;
  actorId: MemberId | null;
  subject: string | null;
  detail: string;
  at: number;
}

export interface PreferenceTable {
  memberId: MemberId;
  telegram: number;
  email: number;
  announcements: number;
  reminders: number;
}
