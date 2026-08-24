/**
 * A screen that keeps itself up to date.
 *
 * It exists for the queue, which is the one page in the app that changes while nobody is touching
 * it: a job is claimed, runs, and lands as done or failed within seconds, and an admin watching a
 * broadcast go out should not have to press anything to see it happen. Every other page changes
 * because somebody changed it.
 *
 * Polling rather than a socket, because the server is one process a club runs on the cheapest box
 * it could find, and a request every few seconds from the two people who ever open this page costs
 * less than a connection the runtime has to hold open. A hidden tab asks for nothing at all: a
 * laptop left open on this page for a week is otherwise a hundred thousand pointless requests.
 */
export class Live {
  /** How long between asks. Short enough to watch a queue drain, long enough not to be a load. */
  static readonly EVERY = 5_000;

  /** Whether it is watching. A person reading a failure wants the page to hold still. */
  on = $state(true);

  constructor(
    private readonly again: () => Promise<void>,
    readonly every: number = Live.EVERY,
  ) {}

  /** Starts the loop and answers how to stop it, which is exactly what an `$effect` returns. */
  watch(): () => void {
    const timer = setInterval(() => {
      if (this.on && !document.hidden) void this.again();
    }, this.every);
    return () => clearInterval(timer);
  }

  toggle(): void {
    this.on = !this.on;
  }
}
