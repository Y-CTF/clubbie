import { Announce, Expand } from '@clubbie/api';
import {
  Event,
  type EventId,
  Job,
  type JobState,
  Member,
  type MemberId,
  Millis,
  type Notice,
  type ScheduleId,
  type SeasonId,
  Site,
} from '@clubbie/core';
import { Diag, Render } from '@clubbie/diag';
import type { Logger } from '@clubbie/log';
import { type Message, Notices, type Notify } from '@clubbie/notify';
import type { Store } from '@clubbie/store';
import { markup } from '@clubbie/term';
import { Codes } from './codes.ts';

export interface Options {
  readonly store: Store;
  readonly notify: Notify;
  readonly log: Logger;
  readonly baseUrl: string;
}

/**
 * The part of the app that acts without being asked: announcements, reminders, promotions from a
 * waitlist, topping schedules up, and sweeping expired rows away.
 *
 * It drains `Jobs`, which is a table, so a redeploy in the middle of a reminder window costs a
 * retry rather than the reminder. Everything it does is idempotent enough to be retried: a member
 * hearing about an event twice is a nuisance, and never hearing is a member who stops coming.
 *
 * One tick claims a batch and runs it. A handler that throws hands the job back to the queue with
 * a longer fuse, three times, and then leaves it `failed` where a person can find it.
 */
export class Scheduler {
  /** How often the queue is drained. A club's deadlines are hours, so half a minute is plenty. */
  static readonly TICK = 30 * Millis.SECOND;
  /** How often expired sessions, spent linking codes and finished jobs are dropped. */
  static readonly SWEEP = Millis.DAY;
  /** How long a finished job is kept, so a question about last night has something to read. */
  static readonly KEEP = Millis.WEEK;
  /** The states that mean a chain is already running, so planning leaves it alone. */
  static readonly ARMED: readonly JobState[] = [Job.INITIAL, Job.RUNNING];

  private timer: ReturnType<typeof setInterval> | null = null;
  private inflight: Promise<number> | null = null;
  private readonly log: Logger;

  constructor(private readonly options: Options) {
    this.log = options.log.child('jobs');
  }

  async start(): Promise<void> {
    await this.plan();
    this.timer = setInterval(() => {
      void this.tick();
    }, Scheduler.TICK);
    this.log.info('scheduler started', { every: Scheduler.TICK, channels: this.options.notify.channels });
  }

  /**
   * Stops ticking and waits for the tick in flight. Closing the store under a running batch is how
   * a job that has already sent its message never reaches `done`, and is sent again five minutes
   * later when its lease expires.
   */
  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    await this.inflight?.catch(() => 0);
    this.log.debug('scheduler stopped');
  }

  /**
   * A sweep, and a top-up per schedule: what must always be queued. Both are scheduled rather than
   * assumed, so a deployment that has been down for a month catches up on its own.
   *
   * Public because `clubbie work` drains from cron without ever calling `start`, and a deployment
   * that never planned would never sweep.
   */
  async plan(now: Date = new Date()): Promise<void> {
    const jobs = this.options.store.jobs;

    /**
     * Armed only when it is not armed already, never re-armed.
     *
     * This runs on every pass, not only at boot: a Workers deployment plans from a cron trigger.
     * "Cancel then schedule" matched only a pending row, so on a cron the chain restarted every
     * few minutes, and the renewal notice below went out to every member each time.
     *
     * A job left `running` by a crash counts as armed: `reclaim` hands it back after its lease,
     * which is one chain rather than the two that cancelling it and queuing a fresh one made.
     */
    if (!(await jobs.holds('sweep', {}, Scheduler.ARMED))) await jobs.schedule('sweep', {}, now, now);

    for (const schedule of await this.options.store.schedules.list()) {
      const wanted = { scheduleId: schedule.id };
      if (await jobs.holds('schedule.expand', wanted, Scheduler.ARMED)) continue;
      await jobs.schedule('schedule.expand', wanted, now, now);
    }

    /**
     * And the renewal the open season owes, if nothing is on the books for it in any state. The
     * route that creates or promotes a season queues this itself and re-queues it when a committee
     * moves the deadline; doing it here as well is for the deployment that was down when the
     * deadline approached, and only for that.
     */
    const season = await this.options.store.seasons.current();
    if (season && !(await jobs.holds('season.renewal', { seasonId: season.id }))) {
      await Announce.renewals(this.options.store, season, now);
    }
  }

  /** Runs everything due. Never runs twice at once: a slow tick is skipped, not stacked. */
  async tick(now: Date = new Date()): Promise<number> {
    if (this.inflight) return 0;

    this.inflight = this.drain(now);
    try {
      return await this.inflight;
    } finally {
      this.inflight = null;
    }
  }

  private async drain(now: Date): Promise<number> {
    try {
      const due = await this.options.store.jobs.claim(now);
      let ran = 0;

      for (const job of due) {
        /**
         * Each job takes its own lease, so a slow batch cannot have its tail reclaimed mid-run.
         * A claim that cannot be taken is that job's problem and not the batch's: it used to
         * escape to the catch below, which left the nineteen rows behind it sitting `running`
         * until their leases expired.
         */
        const held = await this.options.store.jobs.hold(job).catch(() => null);
        if (!held) {
          this.log.warn('job claim lost', { job: job.id, kind: job.kind });
          continue;
        }

        await this.run(held, now);
        ran += 1;
      }
      return ran;
    } catch (error) {
      this.log.error('tick failed', error);
      return 0;
    }
  }

  /**
   * Runs one job and records what happened.
   *
   * Marking it done sits outside the `try` on purpose. Inside, a database error on that one
   * statement was indistinguishable from the work itself failing, so the job went back on the
   * queue with attempts left and the announcement went out a second time. Out here the work is
   * known to have succeeded, and a failure to say so is what it is: something to shout about,
   * because the lease will eventually hand the job back and it will be done twice.
   */
  private async run(job: Job, now: Date): Promise<void> {
    try {
      await this.handle(job, now);
    } catch (error) {
      const diag = Diag.of(error, Codes.job.failed);
      this.log.warn('job failed', {
        job: job.id,
        kind: job.kind,
        attempt: job.attempts + 1,
        reason: Render.plain(diag),
      });
      await this.options.store.jobs.failed(job, Render.plain(diag), now).catch((write: unknown) => {
        this.log.error('job failed and could not be recorded as failed', write, { job: job.id });
      });
      return;
    }

    await this.options.store.jobs.done(job).catch((error: unknown) => {
      this.log.error('job ran but could not be marked done', error, { job: job.id, kind: job.kind });
    });
  }

  /**
   * Every kind, named. The tail throws rather than falling through to a handler: a kind added to
   * `JOBS` and forgotten here would otherwise run whatever the last branch happened to be, which
   * is how a demotion notice became a housekeeping sweep.
   */
  private async handle(job: Job, now: Date): Promise<void> {
    if (job.is('event.announce')) return this.announce(job.payload.eventId);
    if (job.is('event.remind')) return this.remind(job.payload.eventId, now);
    if (job.is('rsvp.promoted')) return this.moved('rsvp.promoted', job.payload);
    if (job.is('rsvp.demoted')) return this.moved('rsvp.demoted', job.payload);
    if (job.is('member.admitted')) return this.admitted(job.payload.memberId);
    if (job.is('schedule.expand')) return this.expand(job.payload.scheduleId);
    if (job.is('season.renewal')) return this.renewal(job.payload.seasonId, now);
    if (job.is('sweep')) return this.sweep(now);

    throw Diag.error(Codes.job.failed, markup`nothing handles a \`${job.kind}\` job`).help(
      'add a branch to Scheduler.handle for it',
    );
  }

  /** Everyone active hears about a new event, unless they have switched announcements off. */
  private async announce(eventId: EventId): Promise<void> {
    const event = await this.options.store.events.byId(eventId);
    if (!event) return;

    const [club, audience, kind] = await Promise.all([
      this.options.store.club.read(),
      this.options.store.members.list({ status: Member.ACTIVE }),
      /** The club's own word for its evenings, which only the club knows and the notice shows. */
      this.options.store.kinds.byId(event.kind),
    ]);
    const notice = Notices.published(event, club, this.where(event), kind?.label ?? null);
    await this.told('event.published', audience, notice);
  }

  /**
   * Only the people who said they were coming get a reminder. The rest already decided.
   *
   * An event that has happened is dropped rather than sent. A reminder is only ever queued for the
   * evening before, so this looks impossible: it is not, because a failed job can be put back by
   * hand from the settings page weeks later, and "*Training night* is tomorrow" about a night three
   * weeks gone is the one thing that screen exists to prevent.
   */
  private async remind(eventId: EventId, now: Date): Promise<void> {
    const event = await this.options.store.events.byId(eventId);
    if (event?.state !== Event.LIVE || event.past(now)) return;

    const club = await this.options.store.club.read();
    const sheet = await this.options.store.rsvps.sheet(event.id);
    const coming = sheet.filter((entry) => entry.rsvp.seated).map((entry) => entry.member);
    await this.told('event.reminder', coming, Notices.reminder(event, club, this.where(event)));
  }

  /** A seat that changed hands, either way: the member it moved for is the only one told. */
  private async moved(
    notice: 'rsvp.promoted' | 'rsvp.demoted',
    payload: { eventId: EventId; memberId: MemberId },
  ): Promise<void> {
    const [event, member] = await Promise.all([
      this.options.store.events.byId(payload.eventId),
      this.options.store.members.byId(payload.memberId),
    ]);
    if (!event || !member) return;

    const club = await this.options.store.club.read();
    const message =
      notice === 'rsvp.promoted'
        ? Notices.promoted(event, club, this.where(event))
        : Notices.demoted(event, club, this.where(event));
    await this.told(notice, [member], message);
  }

  private async admitted(memberId: MemberId): Promise<void> {
    const member = await this.options.store.members.byId(memberId);
    if (!member) return;

    const club = await this.options.store.club.read();
    const home = Site.url(this.options.baseUrl, 'events');
    await this.told('member.admitted', [member], Notices.admitted(member, club, home));
  }

  private async expand(scheduleId: ScheduleId): Promise<void> {
    const schedule = await this.options.store.schedules.byId(scheduleId);
    if (!schedule) return;

    const { timezone } = await this.options.store.club.read();
    await Expand.run(this.options.store, schedule, this.log, timezone);
  }

  /**
   * The people who have not renewed into the open season, and only them.
   *
   * Nobody is written to twice, because the job is one row per season and is cancelled whenever
   * the season changes. A member who renewed the day the message was queued is off the audience by
   * the time it runs, since the roster is read here rather than at the moment it was armed.
   */
  private async renewal(seasonId: SeasonId, now: Date): Promise<void> {
    const store = this.options.store;
    const season = await store.seasons.byId(seasonId);
    /** A season that stopped being the current one, or stopped taking renewals, owes nothing. */
    if (!season?.current || !season.renewable(now)) return;

    const [roster, active, club] = await Promise.all([
      store.seasons.roster(season.id),
      store.members.list({ status: Member.ACTIVE }),
      store.club.read(),
    ]);

    const joined = new Set(roster.map((member) => member.id));
    const owed = active.filter((member) => !joined.has(member.id));
    if (owed.length === 0) return;

    const where = Site.url(this.options.baseUrl, 'seasons');
    await this.told('season.renewal', owed, Notices.renewal(season, club, where));
  }

  /** Housekeeping, and the job that queues the next one of itself. */
  private async sweep(now: Date): Promise<void> {
    const [sessions, links, jobs] = await Promise.all([
      this.options.store.sessions.sweep(now),
      this.options.store.links.sweep(now),
      this.options.store.jobs.sweep(new Date(now.getTime() - Scheduler.KEEP)),
    ]);

    this.log.info('swept', { sessions, links, jobs });
    const next = new Date(now.getTime() + Scheduler.SWEEP);
    await this.options.store.jobs.schedule('sweep', {}, next, now);
  }

  /**
   * Sends a notice, and hands the job back when nothing took it.
   *
   * A partial broadcast succeeds: one blocked chat must not re-announce an evening to forty
   * people. A broadcast where every channel refused is an outage, and throwing here is what makes
   * the queue's retry mean anything. Without it a provider answering 503 was logged, swallowed,
   * and the job marked done, so `Job.TRIES` and `Job.BACKOFF` never once ran.
   */
  private async told(notice: Notice, members: readonly Member[], message: Message): Promise<void> {
    const out = await this.options.notify.send(notice, members, message);
    const refused = out.filter((delivery) => delivery.refused).length;
    if (refused === 0 || out.some((delivery) => delivery.sent)) return;

    throw Diag.error(Codes.job.refused, markup`no channel would take a \`${notice}\``)
      .note(markup`${refused} of ${out.length} members were refused by every channel they have`)
      .help('check the provider credentials, then retry the job from the jobs page');
  }

  private where(event: Event): string {
    return Site.url(this.options.baseUrl, 'event', { id: event.id });
  }
}
