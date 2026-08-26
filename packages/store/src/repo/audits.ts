import { type Act, Audit, Id, type MemberId } from '@clubbie/core';
import type { Kysely, Selectable, SelectQueryBuilder } from 'kysely';
import { Row } from '../row.ts';
import type { AuditTable, Schema } from '../schema.ts';

export interface Which {
  readonly act?: Act | undefined;
  readonly actorId?: MemberId | undefined;
  readonly subject?: string | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

/**
 * The trail of admin acts. Writing to it never fails a request: an act that happened but was not
 * recorded is a gap in a report, and refusing the act instead would be a worse answer to it.
 */
export class Audits {
  constructor(private readonly db: Kysely<Schema>) {}

  static of(row: Selectable<AuditTable>): Audit {
    return new Audit({
      id: row.id,
      act: row.act,
      actorId: row.actorId,
      subject: row.subject,
      detail: Audits.parse(row.detail),
      at: Row.at(row.at),
    });
  }

  private static parse(text: string): Record<string, unknown> {
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return {};
    }
  }

  async record(
    act: Act,
    actorId: MemberId | null,
    subject: string | null,
    detail: Record<string, unknown> = {},
    now: Date = new Date(),
  ): Promise<Audit> {
    const row = await this.db
      .insertInto('audit')
      .values({
        id: Id.create<'audit'>(),
        act,
        actorId,
        subject,
        detail: JSON.stringify(detail),
        at: Row.ms(now),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return Audits.of(row);
  }

  /** How many entries match, ignoring the page: what tells a pager it has somewhere to go. */
  async count(which: Which = {}): Promise<number> {
    const query = this.filtered(
      this.db.selectFrom('audit').select((eb) => eb.fn.countAll().as('total')),
      which,
    );
    return Number((await query.executeTakeFirst())?.total ?? 0);
  }

  async list(which: Which = {}): Promise<Audit[]> {
    const query = this.filtered(
      this.db
        .selectFrom('audit')
        .selectAll()
        .orderBy('at', 'desc')
        /** A total order: two acts in the same millisecond must not swap between pages. */
        .orderBy('id', 'desc')
        .limit(which.limit ?? Audit.PAGE)
        .offset(which.offset ?? 0),
      which,
    );
    return (await query.execute()).map(Audits.of);
  }

  /** The one place a filter is turned into `where`s, so a listing and its count cannot disagree. */
  private filtered<Q extends SelectQueryBuilder<Schema, 'audit', Row>, Row>(query: Q, which: Which): Q {
    let out = query;
    if (which.act) out = out.where('act', '=', which.act) as Q;
    if (which.actorId) out = out.where('actorId', '=', which.actorId) as Q;
    if (which.subject) out = out.where('subject', '=', which.subject) as Q;
    return out;
  }
}
