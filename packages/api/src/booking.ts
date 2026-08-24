import { type Answer, Event, type Member, type MemberId, Rsvp } from '@clubbie/core';
import { Diag } from '@clubbie/diag';
import type { Logger } from '@clubbie/log';
import type { Store } from '@clubbie/store';
import { markup, When } from '@clubbie/term';
import { Codes } from './codes.ts';
import { Fail, Refusal } from './fail.ts';

/**
 * The rules an answer has to satisfy. They live here rather than in a route because two callers
 * enforce them (the API and the bot), and rather than in `core` because both need to count the
 * seats already taken, which is a query.
 *
 * The seat is taken in one transaction, in the store: counting here and writing afterwards is how
 * two members answering at the same moment are both told they have the last place.
 *
 * An organiser marking attendance goes around these rules on purpose: someone who turned up after
 * the deadline, or beyond the capacity, still turned up, and a sheet that cannot say so is wrong.
 *
 * Notices about a seat changing hands are queued as jobs rather than sent here: a member
 * withdrawing should not wait on a chat provider, and a notice that is owed should survive the
 * process that owed it.
 */
export class Booking {
  constructor(
    private readonly store: Store,
    private readonly log: Logger,
  ) {}

  async answer(event: Event, member: Member, answer: Answer, now: Date = new Date()): Promise<Rsvp> {
    this.open(event, now);
    await this.queueable(answer);

    const { rsvp, taken } = await this.store.rsvps.claim(event.id, member.id, answer, event.capacity, now);
    if (!rsvp) throw await this.full(event, taken);

    this.log.info('answered', { event: event.id, member: member.id, answer });

    /** Giving up a seat hands it on in the same request, so the next person hears within minutes. */
    if (!rsvp.seated) await this.promote(event, now);

    /** A waitlist answer on an event with room is promoted at once, so report what it became. */
    return (await this.store.rsvps.byMember(event.id, member.id)) ?? rsvp;
  }

  async withdraw(event: Event, member: Member, now: Date = new Date()): Promise<void> {
    this.open(event, now);
    const promoted = await this.store.rsvps.withdraw(event.id, member.id, event.capacity, now);
    this.log.info('withdrew', { event: event.id, member: member.id });
    await this.told('rsvp.promoted', event, promoted, now);
  }

  /** Promotes into whatever room there is now, and tells whoever moved. */
  async promote(event: Event, now: Date = new Date()): Promise<MemberId[]> {
    const promoted = await this.store.rsvps.promote(event.id, event.capacity, now);
    await this.told('rsvp.promoted', event, promoted, now);
    return promoted;
  }

  /**
   * Fits the answers to a capacity that has just changed, and tells whoever moved. A capacity that
   * grew hands places to the waitlist; one that shrank takes them back, newest seat first, because
   * an event left silently over capacity refuses every later answer as full.
   */
  async resize(event: Event, now: Date = new Date()): Promise<MemberId[]> {
    if (event.capacity === null) return this.promote(event, now);

    const demoted = await this.store.rsvps.trim(event.id, event.capacity, now);
    if (demoted.length === 0) return this.promote(event, now);

    await this.told('rsvp.demoted', event, demoted, now);
    return demoted;
  }

  private async told(
    notice: 'rsvp.promoted' | 'rsvp.demoted',
    event: Event,
    members: readonly MemberId[],
    now: Date,
  ): Promise<void> {
    for (const memberId of members) {
      await this.store.jobs.schedule(notice, { eventId: event.id, memberId }, now, now);
      this.log.info(notice, { event: event.id, member: memberId });
    }
  }

  /** The deadline, reported with the date rather than as a bare refusal. */
  private open(event: Event, now: Date): void {
    if (event.open(now)) return;

    const reason =
      event.state === Event.LIVE
        ? Diag.error(Codes.rsvp.closed, markup`answers to *${event.title}* closed`)
            .note(markup`the deadline was ${When.stamp(event.deadline)}`)
            .help('ask an organiser to mark you present on the day')
        : Diag.error(Codes.rsvp.state, markup`*${event.title}* is ${event.state}`).help(
            'only a published event takes answers',
          );

    throw Fail.because(Refusal.Closed, reason);
  }

  /**
   * Whether this club keeps a queue at all. One that does not has a full event that is simply
   * full: the answer is refused here rather than accepted and then never promoted, which would be
   * a member waiting for a place nothing would ever hand them.
   */
  private async queueable(answer: Answer): Promise<void> {
    if (answer !== Rsvp.QUEUED) return;

    const { waitlist } = await this.store.club.read();
    if (waitlist) return;

    throw Fail.because(
      Refusal.Closed,
      Diag.error(Codes.rsvp.state, 'this club does not keep a waiting list').help(
        'answer when a place frees up, or ask an organiser to raise the capacity',
      ),
    );
  }

  /**
   * What a member is told when the last place went to somebody else. It names the answer that does
   * work, when there is one: `waitlist` needs no place, and is what the next withdrawal is handed
   * to. A club that keeps no queue has nothing to offer instead, and says so.
   */
  private async full(event: Event, taken: number): Promise<Fail> {
    const [waiting, club] = await Promise.all([this.store.rsvps.queue(event.id), this.store.club.read()]);
    this.log.debug('event full', { event: event.id, capacity: event.capacity, taken });

    const diag = Diag.error(
      Codes.rsvp.full,
      markup`all ${event.capacity} places at *${event.title}* are taken`,
    ).note(markup`${taken} places are held, and ${waiting.length} members are waiting for one`);

    return Fail.because(
      Refusal.Full,
      club.waitlist
        ? diag.help(markup`answer \`${Rsvp.QUEUED}\` to take the next place that frees up`)
        : diag.help('watch the event: a place that frees up is taken by whoever answers first'),
    );
  }
}
