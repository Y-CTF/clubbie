import { type Refused, refused } from './api.ts';

export const State = {
  Idle: 'idle',
  Loading: 'loading',
  Ready: 'ready',
  Failed: 'failed',
} as const;

export type State = (typeof State)[keyof typeof State];

/**
 * One async read, as reactive state. It exists instead of a data-fetching library because the app
 * needs four things from one, and all four are thirty lines: a state machine, a way to refetch, a
 * guarantee that a slow response cannot overwrite a newer one, and a way to show a change before
 * the server has agreed to it.
 *
 * The ticket is what makes the last two work: every load and every optimistic change takes one,
 * and anything holding a stale ticket is dropped rather than rendered. A tap on a phone with one
 * bar would otherwise be undone twice, first by the refetch it raced and then by its own rollback.
 */
export class Query<T> {
  state = $state<State>(State.Idle);
  data = $state<T | null>(null);
  error = $state<Refused | null>(null);

  private ticket = 0;

  constructor(private readonly run: () => Promise<T>) {}

  /** Starts the query, or restarts it. Safe to call from an effect: it is not reentrant. */
  async load(): Promise<void> {
    const mine = ++this.ticket;
    this.state = State.Loading;
    this.error = null;

    try {
      const data = await this.run();
      if (mine !== this.ticket) return;
      /**
       * The same answer as last time is still an answer. Returning without settling the state left
       * the query `loading` for good, and every page that renders an empty list only once the read
       * is `ready` waited on a read that had already come back.
       */
      if (this.held === data) {
        this.state = State.Ready;
        return;
      }

      this.held = data;
      this.data = data;
      this.state = State.Ready;
    } catch (error) {
      if (mine !== this.ticket) return;
      this.error = refused(error);
      this.state = State.Failed;
    }
  }

  /**
   * Puts in an answer the caller already holds, without asking for one.
   *
   * It takes a ticket like everything else here, so a request that was already in flight when it
   * was called cannot land on top of it a moment later and undo it.
   *
   * Putting in the answer that is already in is nothing at all. `$state` wraps what it holds in a
   * proxy, so `data === this.data` is false even for the very array that was put in a moment ago,
   * and assigning it again invalidates every page that reads it. What is actually held is
   * remembered unwrapped for exactly this comparison.
   */
  put(data: T): void {
    if (this.held === data) return;

    this.held = data;
    this.ticket += 1;
    this.data = data;
    this.state = State.Ready;
  }

  /** The last answer as the caller handed it over, before `$state` wrapped it. */
  private held: T | null = null;

  /**
   * Shows a change now and answers how to take it back. What the caller does with that is the
   * pattern this exists for: patch, write, and put the old data back if the write was refused.
   *
   * Rolling back is conditional on the ticket, so a refusal that arrives after the page has been
   * reloaded (or changed again) leaves the newer data alone rather than resurrecting what the
   * member was looking at two seconds ago.
   */
  patch(change: (data: T) => T): () => void {
    const before = this.data;
    if (before === null) return () => {};

    const mine = ++this.ticket;
    this.data = change(before);
    this.state = State.Ready;

    return () => {
      if (mine === this.ticket) this.data = before;
    };
  }

  get loading(): boolean {
    return this.state === State.Loading;
  }

  get ready(): boolean {
    return this.state === State.Ready;
  }

  /** True while the very first load is in flight, which is when a skeleton belongs on screen. */
  get first(): boolean {
    return this.loading && this.data === null;
  }
}
