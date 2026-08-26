import { Id, JOB_STATES, Job, type JobId, type JobKind, type JobState, type Payload } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import { markup } from '@clubbie/term';
import type { Kysely, Selectable, SelectQueryBuilder } from 'kysely';
import { Codes } from '../codes.ts';
import { Row } from '../row.ts';
import type { JobTable, Schema } from '../schema.ts';

/** What a job listing asks for: which slice of the queue, and how much of it. */
export interface Query {
  readonly state?: JobState | undefined;
  readonly kind?: JobKind | undefined;
  readonly limit?: number | undefined;
  readonly offset?: number | undefined;
}

/** How many jobs are in each state, which is the whole queue at a glance. */
export type Tally = Record<JobState, number>;

/**
 * The queue the scheduler drains. It is a table because a hobby deployment restarts often and a
 * reminder that a redeploy silently swallowed is worse than no reminder at all.
 *
 * `claim` moves a batch of due jobs to `running` inside one transaction, so two processes (or one
 * process and a stray `clubbie work`) cannot both send the same announcement.
 */
export class Jobs {
  /** How many jobs one tick takes, which bounds how long a tick can run for. */
  static readonly BATCH = 20;
  constructor(private readonly db: Kysely<Schema>) {}

  static of(row: Selectable<JobTable>): Job {
    return new Job({
      id: row.id,
      kind: row.kind,
      payload: Jobs.parse(row.payload),
      subject: row.subject ?? Job.subject(row.kind, Jobs.parse(row.payload)),
      runAt: Row.at(row.runAt),
      state: row.state,
      claimedAt: Row.atOrNull(row.claimedAt),
      attempts: row.attempts,
      error: row.error,
      createdAt: Row.at(row.createdAt),
    });
  }

  /**
   * A payload that will not parse throws rather than becoming an empty object: a handler handed
   * `{}` does nothing at all and reports success, which is how a club stops getting reminders and
   * nobody finds out. Thrown here, the row lands in the queue as failed, where a person sees it.
   */
  private static parse(text: string): Payload {
    try {
      return JSON.parse(text) as Payload;
    } catch (error) {
      throw Diag.of(error, Codes.payload).note(markup`the job payload is not json: ${text.slice(0, 80)}`);
    }
  }

  async schedule<K extends JobKind>(
    kind: K,
    payload: Payload<K>,
    runAt: Date = new Date(),
    now: Date = new Date(),
  ): Promise<Job> {
    const row = await this.db
      .insertInto('job')
      .values({
        id: Id.create<'job'>(),
        kind,
        payload: JSON.stringify(payload),
        subject: Job.subject(kind, payload),
        runAt: Row.ms(runAt),
        state: Job.INITIAL,
        claimedAt: null,
        attempts: 0,
        error: null,
        createdAt: Row.ms(now),
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return Jobs.of(row);
  }

  /**
   * Everything due, marked as running in the same transaction that selected it.
   *
   * The update re-asserts `pending`, so two drainers that read the same ids cannot both come away
   * with them: the loser's update matches nothing and it returns an empty batch rather than
   * sending the same announcement a second time.
   */
  async claim(now: Date = new Date(), batch = Jobs.BATCH): Promise<Job[]> {
    await this.reclaim(now);

    return this.db.transaction().execute(async (tx) => {
      const due = await tx
        .selectFrom('job')
        .select('id')
        .where('state', '=', Job.INITIAL)
        .where('runAt', '<=', Row.ms(now))
        .orderBy('runAt', 'asc')
        .limit(batch)
        .execute();
      if (due.length === 0) return [];

      const ids = due.map((row) => row.id);
      const rows = await tx
        .updateTable('job')
        .set({ state: Job.RUNNING, claimedAt: Row.ms(now) })
        .where('id', 'in', ids)
        .where('state', '=', Job.INITIAL)
        .returningAll()
        .execute();

      /**
       * A row whose payload will not parse is failed here and left out of the batch: one bad row
       * must not take the whole tick with it, and it has to be visible rather than retried.
       */
      const claimed: Job[] = [];
      for (const row of rows) {
        try {
          claimed.push(Jobs.of(row));
        } catch (error) {
          await tx
            .updateTable('job')
            .set({ state: Job.FAILED, claimedAt: null, error: Diag.of(error, Codes.payload).message })
            .where('id', '=', row.id)
            .execute();
        }
      }
      /** `returning` has no order of its own, so the due order the select asked for is restored. */
      return claimed.sort((a, b) => a.runAt.getTime() - b.runAt.getTime());
    });
  }

  /**
   * Hands back the jobs of a process that died holding them. A crash or a redeploy mid-batch would
   * otherwise leave them `running` forever: never retried, never failed, and untouchable from the
   * jobs screen, which is the one outcome a durable queue must not have.
   */
  async reclaim(now: Date = new Date()): Promise<number> {
    const result = await this.db
      .updateTable('job')
      .set({ state: Job.INITIAL, claimedAt: null })
      .where('state', '=', Job.RUNNING)
      .where('claimedAt', '<=', Row.ms(new Date(now.getTime() - Job.LEASE)))
      .executeTakeFirst();
    return Number(result.numUpdatedRows ?? 0);
  }

  /**
   * Marks a claim finished, and only the claim that is actually in force.
   *
   * The lease is what makes that necessary. A worker that stalls past `Job.LEASE` has its job
   * handed back by `reclaim`, a second worker claims and sends it, and the first one then wakes up
   * and reports on a job that is no longer its own. Without the guard it would write `done` over
   * somebody else's `running`, or worse, `failed` would push a job that has already gone out back
   * into the queue for a third send. Matching on the claim instant is what tells the two apart.
   */
  /**
   * Renews a claim just before the job runs, and reports whether it is still ours.
   *
   * A batch is claimed in one statement, so all twenty rows carry the same `claimedAt` while they
   * run one after another. A batch that takes longer than `Job.LEASE` therefore had its tail
   * handed back by `reclaim` while it was still working through the head, and a second drainer
   * sent those announcements again. Each job now starts its own lease, and a job whose claim was
   * taken while it waited answers `null` rather than running twice.
   */
  async hold(job: Job, now: Date = new Date()): Promise<Job | null> {
    const row = await this.db
      .updateTable('job')
      .set({ claimedAt: Row.ms(now) })
      .where('id', '=', job.id)
      .where('state', '=', Job.RUNNING)
      .where('claimedAt', '=', Row.msOrNull(job.claimedAt))
      .returningAll()
      .executeTakeFirst();
    return row ? Jobs.of(row) : null;
  }

  async done(job: Job): Promise<void> {
    await this.db
      .updateTable('job')
      .set({ state: Job.DONE, error: null, claimedAt: null })
      .where('id', '=', job.id)
      .where('state', '=', Job.RUNNING)
      .where('claimedAt', '=', Row.msOrNull(job.claimedAt))
      .execute();
  }

  /**
   * Reports an attempt that threw. A job with tries left goes back to `pending` with a later
   * `runAt`; one without is `failed`, which is where a person finds it.
   */
  async failed(job: Job, reason: string, now: Date = new Date()): Promise<void> {
    const attempts = job.attempts + 1;
    const spent = attempts >= Job.TRIES;

    await this.db
      .updateTable('job')
      .set({
        attempts,
        error: reason,
        state: spent ? Job.FAILED : Job.INITIAL,
        claimedAt: null,
        runAt: Row.ms(spent ? job.runAt : job.retryAt(now)),
      })
      .where('id', '=', job.id)
      /** Only the claim in force reports on it: see `done`. */
      .where('state', '=', Job.RUNNING)
      .where('claimedAt', '=', Row.msOrNull(job.claimedAt))
      .execute();
  }

  async byId(id: JobId): Promise<Job | null> {
    const row = await this.db.selectFrom('job').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? Jobs.of(row) : null;
  }

  /**
   * Puts a job back in the queue, due now, with its attempts wound back.
   *
   * Two states answer to it, and they are the same act read two ways: a spent job is being given
   * another go, and a job that is only waiting is being told to go now. Neither is a state a
   * drainer is holding, which is the point of asking `Job.REPLAYABLE` rather than naming one.
   *
   * It answers whether a row actually moved, because a job that has since been swept, retried by
   * somebody else, or claimed by a drainer must not be dragged out of whatever state it is in.
   */
  async requeue(id: JobId, now: Date = new Date()): Promise<boolean> {
    const rows = await this.db
      .updateTable('job')
      .set({ state: Job.INITIAL, attempts: 0, error: null, claimedAt: null, runAt: Row.ms(now) })
      .where('id', '=', id)
      .where('state', 'in', Job.REPLAYABLE)
      .returning('id')
      .execute();
    return rows.length > 0;
  }

  /**
   * Throws a job away: the announcement about an event that no longer matters, the reminder a
   * club has decided not to send, the record of one that went out weeks ago. A running job is not
   * one of them: it is in a drainer's hands, and deleting the row under it loses the report.
   */
  async drop(id: JobId): Promise<boolean> {
    const rows = await this.db
      .deleteFrom('job')
      .where('id', '=', id)
      .where('state', 'in', Job.DISCARDABLE)
      .returning('id')
      .execute();
    return rows.length > 0;
  }

  /**
   * A page of the queue, newest first, filtered the way the screen filters it.
   *
   * The order is when the job was created rather than when it is due, because both ends of the
   * queue are read here: a pending job is due in the future and a failed one was due in the past,
   * and one order that means "the work the club has taken on lately" reads the same for both.
   */
  async list(query: Query = {}): Promise<Job[]> {
    const rows = await this.filtered(this.db.selectFrom('job').selectAll(), query)
      .orderBy('createdAt', 'desc')
      /** A total order, so page two is not page one again with one row swapped. */
      .orderBy('id', 'desc')
      .limit(query.limit ?? Job.PAGE)
      .offset(query.offset ?? 0)
      .execute();
    return rows.map(Jobs.of);
  }

  /** How many the same filter matches, which is what tells a pager whether it has a next page. */
  async count(query: Query = {}): Promise<number> {
    const row = await this.filtered(
      this.db.selectFrom('job').select((eb) => eb.fn.countAll().as('total')),
      query,
    ).executeTakeFirst();
    return Number(row?.total ?? 0);
  }

  /**
   * How many jobs are in each state. It is one grouped query rather than four counts because it is
   * read on every refresh of a screen that refreshes itself, and because the four have to agree
   * with each other: two of them read a second apart is a queue that appears to gain and lose work.
   */
  async tally(): Promise<Tally> {
    const rows = await this.db
      .selectFrom('job')
      .select((eb) => ['state', eb.fn.countAll().as('total')])
      .groupBy('state')
      .execute();

    const tally = Object.fromEntries(JOB_STATES.map((state) => [state, 0])) as Record<JobState, number>;
    for (const row of rows) tally[row.state] = Number(row.total);
    return tally;
  }

  /** The one place a filter is turned into `where`s, so a listing and its count cannot disagree. */
  private filtered<Q extends SelectQueryBuilder<Schema, 'job', Row>, Row>(query: Q, wanted: Query): Q {
    let out = query;
    if (wanted.state) out = out.where('state', '=', wanted.state) as Q;
    if (wanted.kind) out = out.where('kind', '=', wanted.kind) as Q;
    return out;
  }

  /**
   * Drops the jobs of one kind about one thing. Both halves of the subject matter: cancelling the
   * announcement for an edited event must leave the promotion notice a member is already owed for
   * that same event alone.
   *
   * Only pending jobs by default. A recurring job passes `running` too, because a process that
   * died holding one would otherwise leave a copy that `reclaim` hands back, and the club would
   * end up with two of whatever it repeats.
   */
  async cancel<K extends JobKind>(
    kind: K,
    payload: Payload<K>,
    states: readonly JobState[] = [Job.INITIAL],
  ): Promise<number> {
    const dropped = await this.db
      .deleteFrom('job')
      .where('subject', '=', Job.subject(kind, payload))
      .where('state', 'in', states)
      .returning('id')
      .execute();
    return dropped.length;
  }

  /**
   * Whether the queue already holds a job of this kind about this thing.
   *
   * What makes planning idempotent. A cron deployment calls `Scheduler.plan` on every pass, and
   * "cancel then schedule" only ever matched a *pending* row, so a notice that had already gone
   * out was queued again, and again, every few minutes.
   */
  async holds<K extends JobKind>(
    kind: K,
    payload: Payload<K>,
    states: readonly JobState[] = Job.STATES,
  ): Promise<boolean> {
    const row = await this.db
      .selectFrom('job')
      .select('id')
      .where('subject', '=', Job.subject(kind, payload))
      .where('state', 'in', states)
      .executeTakeFirst();
    return row !== undefined;
  }

  async sweep(before: Date): Promise<number> {
    const result = await this.db
      .deleteFrom('job')
      .where('state', '=', Job.DONE)
      .where('runAt', '<=', Row.ms(before))
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0);
  }
}
