import { Id, Member, type MemberId, type Role, type Status } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import { markup } from '@clubbie/term';
import type { Kysely, Selectable } from 'kysely';
import { Codes } from '../codes.ts';
import { Lock } from '../lock.ts';
import { Row } from '../row.ts';
import type { MemberTable, Schema } from '../schema.ts';
import { Search } from '../search.ts';

/** An identity as an OAuth provider described it, before it is known to be anybody here. */
export interface Profile {
  readonly provider: string;
  readonly subject: string;
  readonly email: string;
  readonly name: string;
  readonly avatar: string | null;
  /**
   * The organisation an identity belongs to: eduID's `schac_home_organization` claim, which is a
   * domain like `ethz.ch`, or the GitHub organisation an account is a member of, which is a login
   * like `acme`. Null for a provider that says nothing about either. It is what the member row
   * keeps, and what a page shows beside their name.
   */
  readonly organisation?: string | null | undefined;
  /**
   * Every organisation the provider named, when it named more than one. A GitHub account belongs
   * to as many organisations as it likes and any one of them may be the club's door, so the door
   * is checked against all of them and the row keeps the first. eduID names exactly one, and this
   * is that one.
   */
  readonly organisations?: readonly string[] | undefined;
}

/**
 * Optional fields spell `| undefined` throughout the store, because `exactOptionalPropertyTypes`
 * otherwise refuses a validated body: a parsed form legitimately holds `{ name: undefined }`.
 */
export interface Patch {
  readonly name?: string | undefined;
  readonly avatar?: string | null | undefined;
  readonly role?: Role | undefined;
  readonly status?: Status | undefined;
  readonly hidden?: boolean | undefined;
}

export interface Which {
  readonly status?: Status | undefined;
  readonly role?: Role | undefined;
  /** A typed word, matched against a name. Empty is no filter, not no members. */
  readonly query?: string | undefined;
  /**
   * Whether the word may also match an address.
   *
   * It is off by default because `Wire.peer` deliberately keeps an email out of the roster an
   * ordinary member reads, and a filter that matched on one would hand back the same fact a
   * character at a time: `?q=ada@ex` finding a row and `?q=ada@ey` finding none is the address.
   * Only a caller who may already read the roster's addresses passes it.
   */
  readonly emails?: boolean | undefined;
}

export class Members {
  /** The club cannot admit its first member, so whoever signs in first is an admin. */
  static readonly FOUNDER: Role = 'admin';

  constructor(
    private readonly db: Kysely<Schema>,
    private readonly lock: Lock = Lock.NONE,
    private readonly search: Search = Search.ASCII,
  ) {}

  static of(row: Selectable<MemberTable>): Member {
    return new Member({
      id: row.id,
      name: row.name,
      email: row.email,
      avatar: row.avatar,
      organisation: row.organisation,
      role: row.role,
      status: row.status,
      hidden: Row.flag(row.hidden),
      createdAt: Row.at(row.createdAt),
    });
  }

  async byId(id: MemberId): Promise<Member | null> {
    const row = await this.db.selectFrom('member').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? Members.of(row) : null;
  }

  async byEmail(email: string): Promise<Member | null> {
    const row = await this.db.selectFrom('member').selectAll().where('email', '=', email).executeTakeFirst();
    return row ? Members.of(row) : null;
  }

  async list(filter: Which = {}): Promise<Member[]> {
    let query = this.db.selectFrom('member').selectAll().orderBy('name', 'asc');
    if (filter.status) query = query.where('status', '=', filter.status);
    if (filter.role) query = query.where('role', '=', filter.role);

    const wanted = filter.query?.trim();
    if (wanted) {
      const columns = filter.emails ? (['member.name', 'member.email'] as const) : (['member.name'] as const);
      query = query.where((eb) => this.search.any(eb, columns, wanted));
    }

    return (await query.execute()).map(Members.of);
  }

  async count(): Promise<number> {
    const row = await this.db
      .selectFrom('member')
      .select(({ fn }) => fn.countAll<number>().as('total'))
      .executeTakeFirstOrThrow();
    return Number(row.total);
  }

  /**
   * Turns a provider profile into a member, and is the only way one is created.
   *
   * Two cases, not three. The account is known, so it is that member and their details are
   * refreshed. Nobody is known, so a member is created. The third case used to be "the email is
   * known, so this account joins that member", and it was an account takeover waiting to happen:
   * anybody who could get a provider to hand us a verified `ada@ethz.ch` became Ada, admin rights
   * and all, without ever touching the identity provider Ada actually signs in with. A club that
   * has two providers configured had two doors to one account and could not see it.
   *
   * So an address already spoken for is refused, naming the provider that holds it. One person
   * with two providers is a real thing and it needs a real feature: linking a second identity
   * from inside the app, while signed in as the first. It is not this.
   *
   * `status` is what a first-ever sign-in is written with. It is a parameter rather than a
   * constant because a club decides it: one that has already restricted who may sign in at all
   * usually does not also want to click each of them in by hand.
   */
  async enroll(profile: Profile, now: Date = new Date(), status: Status = Member.INITIAL): Promise<Member> {
    /** Compared, stored and matched in one shape, rather than in whatever a provider sent. */
    const email = profile.email.trim().toLowerCase();
    const organisation = profile.organisation?.trim().toLowerCase() ?? null;

    return this.db.transaction().execute(async (tx) => {
      /**
       * Enrolments queue behind each other. Two people completing their first sign-in at the same
       * second both read an empty roster otherwise, and a club that is supposed to have one
       * founder gets two admins; the same read is what decides whether an address is taken.
       */
      await this.lock.club(tx);

      const linked = await tx
        .selectFrom('account')
        .innerJoin('member', 'member.id', 'account.memberId')
        .selectAll('member')
        .where('account.provider', '=', profile.provider)
        .where('account.subject', '=', profile.subject)
        .executeTakeFirst();

      if (linked) {
        /** Their name, picture and institution are the provider's to change between sign-ins. */
        const refreshed = await tx
          .updateTable('member')
          .set({ name: profile.name, avatar: profile.avatar, organisation })
          .where('id', '=', linked.id)
          .returningAll()
          .executeTakeFirstOrThrow();
        return Members.of(refreshed);
      }

      const taken = await tx
        .selectFrom('member')
        .leftJoin('account', 'account.memberId', 'member.id')
        .select(['member.id', 'account.provider'])
        .where('member.email', '=', email)
        .executeTakeFirst();

      if (taken) {
        throw Diag.error(Codes.identity, markup`${email} already belongs to a member here`)
          .note(
            taken.provider
              ? markup`that account signs in with *${taken.provider}*`
              : 'that account was not created by signing in',
          )
          .help('sign in the way that account was created, or ask an organiser to sort it out');
      }

      const member = await tx
        .insertInto('member')
        .values({
          id: Id.create<'member'>(),
          name: profile.name,
          email,
          avatar: profile.avatar,
          organisation,
          role: (await Members.first(tx)) ? Member.ORDINARY : Members.FOUNDER,
          status,
          hidden: Row.bit(false),
          createdAt: Row.ms(now),
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      await tx
        .insertInto('account')
        .values({
          provider: profile.provider,
          subject: profile.subject,
          memberId: member.id,
          linkedAt: Row.ms(now),
        })
        .execute();

      return Members.of(member);
    });
  }

  private static async first(tx: Kysely<Schema>): Promise<boolean> {
    const row = await tx.selectFrom('member').select('id').limit(1).executeTakeFirst();
    return row !== undefined;
  }

  async update(id: MemberId, patch: Patch): Promise<Member | null> {
    const values = {
      ...(patch.name !== undefined && { name: patch.name }),
      ...(patch.avatar !== undefined && { avatar: patch.avatar }),
      ...(patch.role !== undefined && { role: patch.role }),
      ...(patch.status !== undefined && { status: patch.status }),
      ...(patch.hidden !== undefined && { hidden: Row.bit(patch.hidden) }),
    };
    if (Object.keys(values).length === 0) return this.byId(id);

    const row = await this.db
      .updateTable('member')
      .set(values)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? Members.of(row) : null;
  }

  async remove(id: MemberId): Promise<void> {
    await this.db.deleteFrom('member').where('id', '=', id).execute();
  }
}
