import { Kind, type KindId } from '@clubbie/core';
import type { Kysely, Selectable } from 'kysely';
import type { KindTable, Schema } from '../schema.ts';

export interface Draft {
  readonly id: KindId;
  readonly label: string;
  readonly position?: number | undefined;
}

export interface Patch {
  readonly label?: string | undefined;
  readonly position?: number | undefined;
}

/**
 * The club's own words for what an event is.
 *
 * Nothing here cascades: an event stores a kind id, and a kind that events point at cannot be
 * deleted (`usage` is what the route asks before it tries). That is deliberate rather than a
 * foreign key, because the answer a club needs is "eleven events are workshops", not a constraint
 * violation, and because adding a key to a column that already exists is a table rebuild in one of
 * the two dialects and not the other.
 */
export class Kinds {
  constructor(private readonly db: Kysely<Schema>) {}

  static of(row: Selectable<KindTable>): Kind {
    return new Kind({ id: row.id, label: row.label, position: row.position });
  }

  async list(): Promise<Kind[]> {
    const rows = await this.db
      .selectFrom('kind')
      .selectAll()
      .orderBy('position', 'asc')
      .orderBy('label', 'asc')
      .execute();
    return rows.map(Kinds.of);
  }

  async byId(id: KindId): Promise<Kind | null> {
    const row = await this.db.selectFrom('kind').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? Kinds.of(row) : null;
  }

  /** Whether a value is one of this club's kinds, which is what every write checks. */
  async has(id: string): Promise<boolean> {
    if (!Kind.is(id)) return false;
    return (await this.byId(id)) !== null;
  }

  async count(): Promise<number> {
    const row = await this.db
      .selectFrom('kind')
      .select(({ fn }) => fn.countAll<number>().as('total'))
      .executeTakeFirstOrThrow();
    return Number(row.total);
  }

  /** How many events and schedules point at a kind, which is what stands between it and deletion. */
  async usage(id: KindId): Promise<number> {
    const [events, schedules] = await Promise.all([
      this.db
        .selectFrom('event')
        .select(({ fn }) => fn.countAll<number>().as('total'))
        .where('kind', '=', id)
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('schedule')
        .select(({ fn }) => fn.countAll<number>().as('total'))
        .where('kind', '=', id)
        .executeTakeFirstOrThrow(),
    ]);
    return Number(events.total) + Number(schedules.total);
  }

  async add(draft: Draft): Promise<Kind> {
    const last = await this.db
      .selectFrom('kind')
      .select(({ fn }) => fn.max('position').as('last'))
      .executeTakeFirst();

    const row = await this.db
      .insertInto('kind')
      .values({
        id: draft.id,
        label: draft.label,
        position: draft.position ?? Number(last?.last ?? 0) + Kind.STEP,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return Kinds.of(row);
  }

  async update(id: KindId, patch: Patch): Promise<Kind | null> {
    const values = {
      ...(patch.label !== undefined && { label: patch.label }),
      ...(patch.position !== undefined && { position: patch.position }),
    };
    if (Object.keys(values).length === 0) return this.byId(id);

    const row = await this.db
      .updateTable('kind')
      .set(values)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? Kinds.of(row) : null;
  }

  async remove(id: KindId): Promise<boolean> {
    const gone = await this.db.deleteFrom('kind').where('id', '=', id).returning('id').execute();
    return gone.length > 0;
  }
}
