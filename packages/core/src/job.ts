import type { EventId } from './event.ts';
import type { Id } from './id.ts';
import type { MemberId } from './member.ts';
import { Millis } from './millis.ts';
import type { ScheduleId } from './schedule.ts';
import type { SeasonId } from './season.ts';

export type JobId = Id<'job'>;

/**
 * Work the app owes itself later: an announcement to send, a reminder the evening before, a
 * schedule to top up, expired rows to drop.
 *
 * It is a table rather than a timer because a restart is the normal state of a hobby deployment,
 * and a club that stops sending reminders every time somebody deploys is a club that stops
 * trusting the reminders.
 */
export const JOBS = [
  'event.announce',
  'event.remind',
  'rsvp.promoted',
  'rsvp.demoted',
  'member.admitted',
  'schedule.expand',
  'season.renewal',
  'sweep',
] as const;
export type Kind = (typeof JOBS)[number];

/** What each kind is about. A handler receives exactly this, already parsed. */
export interface Payloads {
  'event.announce': { readonly eventId: EventId };
  'event.remind': { readonly eventId: EventId };
  'rsvp.promoted': { readonly eventId: EventId; readonly memberId: MemberId };
  'rsvp.demoted': { readonly eventId: EventId; readonly memberId: MemberId };
  'member.admitted': { readonly memberId: MemberId };
  'schedule.expand': { readonly scheduleId: ScheduleId };
  'season.renewal': { readonly seasonId: SeasonId };
  sweep: Record<string, never>;
}

export type Payload<K extends Kind = Kind> = Payloads[K];

/** Where a job is in its life. `failed` is terminal and keeps the reason it stopped. */
export const STATES = ['pending', 'running', 'done', 'failed'] as const;
export type State = (typeof STATES)[number];

export interface JobFields<K extends Kind = Kind> {
  readonly id: JobId;
  readonly kind: K;
  readonly payload: Payload<K>;
  /**
   * What the job is about: its kind and the id in its payload. Both, because cancelling the
   * announcement for an edited event must not also cancel the promotion notice somebody is owed
   * for the same event.
   */
  readonly subject: string;
  readonly runAt: Date;
  readonly state: State;
  readonly claimedAt: Date | null;
  readonly attempts: number;
  readonly error: string | null;
  readonly createdAt: Date;
}

/** The fields are declared once, in `JobFields`; the class carries them by declaration merging. */
export interface Job<K extends Kind = Kind> extends JobFields<K> {}

export class Job<K extends Kind = Kind> {
  static readonly KINDS = JOBS;
  static readonly STATES = STATES;
  static readonly INITIAL: State = 'pending';
  /** The three states the queue moves a job through once it has claimed it. */
  static readonly RUNNING: State = 'running';
  static readonly DONE: State = 'done';
  static readonly FAILED: State = 'failed';
  /** How many jobs a screen shows at once. */
  static readonly WINDOW = 20;
  /** How many a page of the queue holds. Its own number: a page is not a batch and not a screen. */
  static readonly PAGE = 100;
  /** How many times a job is retried before it is left alone for a person to look at. */
  static readonly TRIES = 3;
  /**
   * The states a person may put a job back from: one that has given up, and one that is only
   * waiting, which a person puts back when they mean "do it now". A job that has been done is not
   * one of them, because putting it back is sending a member the same message twice, and a running
   * job belongs to whichever drainer claimed it.
   */
  static readonly REPLAYABLE: readonly State[] = ['failed', 'pending'];
  /** The same question for throwing one away. History may go; work in somebody's hands may not. */
  static readonly DISCARDABLE: readonly State[] = ['failed', 'pending', 'done'];
  /** What separates a job's kind from what it is about in its subject. */
  static readonly SEP = ':';
  /** How long a failed attempt waits before the next one, doubling each time. */
  static readonly BACKOFF = Millis.MINUTE;
  /**
   * How long a claimed job may stay claimed. Past it the process that took it is assumed dead and
   * the job is offered again: a doubled announcement is a nuisance, a lost one is a member who
   * did not know about the event.
   */
  static readonly LEASE = 5 * Millis.MINUTE;

  constructor(fields: JobFields<K>) {
    Object.assign(this, fields);
  }

  /** The id inside a payload, which the subject is built from. */
  private static about<K extends Kind>(kind: K, payload: Payload<K>): string | null {
    switch (kind) {
      case 'event.announce':
      case 'event.remind':
      case 'rsvp.promoted':
      case 'rsvp.demoted':
        return (payload as Payload<'event.announce'>).eventId;
      case 'member.admitted':
        return (payload as Payload<'member.admitted'>).memberId;
      case 'schedule.expand':
        return (payload as Payload<'schedule.expand'>).scheduleId;
      case 'season.renewal':
        return (payload as Payload<'season.renewal'>).seasonId;
      default:
        return null;
    }
  }

  /**
   * The id a payload is about. Deriving it here is what lets the queue drop the announcement for
   * a deleted event without reading every payload back and guessing at its shape.
   */
  static subject<K extends Kind>(kind: K, payload: Payload<K>): string {
    const about = Job.about(kind, payload);
    return about === null ? kind : `${kind}${Job.SEP}${about}`;
  }

  /**
   * Narrows a job to one kind, which is what a handler needs: the payload types differ per kind
   * and a `switch` on a field cannot tell TypeScript that, so this says it once instead of every
   * handler casting.
   */
  is<W extends Kind>(kind: W): this is Job<W> {
    return (this.kind as Kind) === kind;
  }

  get exhausted(): boolean {
    return this.attempts >= Job.TRIES;
  }

  /** When the next attempt is due, backing off so a broken provider is not hammered. */
  retryAt(now: Date = new Date()): Date {
    return new Date(now.getTime() + Job.BACKOFF * 2 ** this.attempts);
  }
}
