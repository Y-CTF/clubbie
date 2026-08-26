/**
 * Milliseconds, by the name a person uses for them.
 *
 * Every duration in the app is an instant's worth of milliseconds, because that is the one column
 * type both dialects agree on. The factors were written out in nine places across five packages,
 * and `60 * 60 * 1000` reads as arithmetic rather than as an hour wherever it appears.
 *
 * What lives here is only the conversion. A duration that carries a *decision* stays with whatever
 * made it (`Job.LEASE`, `Links.TTL`, `Scheduler.TICK`), and is written in these units.
 */
export namespace Millis {
  export const SECOND = 1000;
  export const MINUTE = 60 * SECOND;
  export const HOUR = 60 * MINUTE;
  export const DAY = 24 * HOUR;
  export const WEEK = 7 * DAY;
}
